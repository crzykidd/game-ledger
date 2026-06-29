# Data model & scale

> How game data is stored and how it scales to millions of turn records. Builds on the module
> contract (`docs/module-contract.md`) and the write model (`docs/spec.md`).

## Source-of-truth split (what lives where)

| Thing | Lives in | Why |
|---|---|---|
| **Scoring types** | **code** (a versioned registry) | The reusable, tested unit. New type = add code once. Referenced by `id`+`version`. |
| **Game modules** | **data** (definitions) | A game = a definition naming a scoring type + config/presentation. Add a game = add data. |
| **Games / turns / results** | **DB** | The actual play records. |

A scoring type is **not** a DB row you keep in sync — it's a code handler. The DB only stores a
**reference** (`scoring_type_id` + `scoring_type_version`). An optional lightweight seed/lookup
table can mirror the registry for listing/UI, but code is the source of truth.

## Entities

### Reference / config (small, slow-changing)
- `users` — accounts (auth; see `docs/user-management.md`).
- `players` — roster entries (linked user *or* guest name).
- `playgroups`, `playgroup_members` — recurring friend groups.
- `game_modules` — game definitions (data) referencing a scoring type. (Could be seeded files
  or rows; **decision** in `module-contract.md`.)
- `games` — one game instance.
- `participations` — **the 1→many**: which players are in which game (+ seat/order, team).

### High-volume (the hot table)
- `game_events` — the **append-only turn/score log**. This is the "millions of records" table.

### Derived / materialized (query surfaces)
- `game_state` — current materialized score state per **active** game (replayed from events).
- `results` — **one row per participation**: the normalized `{rank, did_win, score}`. This is
  what stats/leaderboards read — **never the event log.**

## The hot table: `game_events`

```sql
game_events (
  id              bigint generated always as identity,   -- or game_id+seq as PK
  game_id         bigint     not null,
  seq             int        not null,                   -- per-game monotonic version
  author_player_id bigint,
  type            text       not null,                   -- event/turn type within the scoring type
  payload         jsonb      not null,                   -- turn record, shaped by the scoring type
  client_event_id uuid       not null,                   -- idempotency (offline outbox replay)
  created_at      timestamptz not null default now(),
  primary key (game_id, seq)
);
create unique index on game_events (client_event_id);     -- dedupe re-sends
-- (game_id, seq) PK already serves ordered replay of a single game
```

Properties that make it scale:

- **Append-only & immutable** — no UPDATEs, no row bloat, trivial to replicate/partition.
- **Accessed only by `game_id`** — replaying a game, resuming, undo, conflict checks all key on
  `(game_id, seq)`. There is **no query that scans across all events**.
- **`payload` is JSONB shaped by the scoring type** — no per-game columns, no migration to add a
  game. Don't index inside it (you never filter stats by payload contents).
- **`client_event_id` unique** → idempotent writes (safe offline outbox flush / retries).

## Why it scales to millions+ (the core idea)

**Separate the write-optimized log from the read-optimized aggregates.** Stats never touch the
big table.

- **Writes:** append-only inserts, human-paced (a turn every few seconds), idempotent. Even
  thousands of concurrent games is a trivial insert rate.
- **Live reads:** by `game_id` only — bounded to one game's events (tens to low-hundreds of
  rows). Fast regardless of total table size.
- **Stats / history / leaderboards:** read **`results`** (one row per player per game) and
  aggregate there — **not** the event log. A user with 1,000 games = 1,000 result rows to scan,
  not 50,000 events.

So the giant table is **write-mostly, read-by-`game_id`-only**, and the query-heavy surface
(`results`) stays small. That's the whole trick.

### Reality check on "millions"

A well-indexed Postgres table handles **tens of millions** of rows comfortably on one instance.
Concretely: a hyper-active group playing 10 games/day for 10 years ≈ 36,500 games; at ~50
turns/game ≈ **~1.8M events** — and only ~180k `results` rows. "Millions of turn records" is
**well within a single Postgres**, no exotic infra. The design below is about staying clean,
not rescuing a system in trouble.

## Scaling levers (reach for them in this order)

1. **Correct indexing** — `(game_id, seq)` PK + unique `client_event_id`. Covers everything up
   to many millions. *(Day 1.)*
2. **Keep stats off the log** — materialize `results`; aggregate there. The real win. *(Day 1.)*
3. **Partition `game_events`** — by time (`created_at` monthly) or by `archived` flag, so cold
   completed-game events stay out of the hot path. *(At tens of millions / for tidy archival.)*
4. **Archive or compact completed games** — once a game is `complete`, its events are only
   needed for undo/audit (you already have `results` + a final `game_state` snapshot). Move them
   to a cold partition or archive table. *(Optional, far out.)*
5. **Read replicas / cached leaderboards** — only if read load ever demands it. *(Probably never
   for a homelab app.)*

## Lifecycle of a turn (end to end)

1. Scorekeeper enters a turn → client writes a `game_event` to the outbox (IndexedDB), updates
   local state optimistically.
2. Outbox flushes → server validates `seq`/idempotency, **appends** to `game_events`, updates
   the materialized `game_state` for that game.
3. On **game complete** → the scoring-type handler computes finals; write `results` rows (the
   normalized `{rank, did_win, score}`) and a final `game_state` snapshot.
4. Stats/leaderboards/history read `results` (+ `participations`, `playgroups`) — fast, small.

## Scoring-type ↔ storage relationship

- `games.scoring_type_id` + `scoring_type_version` pin the type (alongside `module_id` +
  `module_version`) for **history immutability** — old games resolve under the type version they
  were played with.
- `game_events.payload` conforms to the **turn-record schema the scoring type declares**; the
  type's handler validates it on write and aggregates/resolves on read/finalize.
- A new game with a brand-new scoring shape → add a **type** to the code registry once; the new
  module references it. No schema change (still JSONB payload + the same tables).

## System / settings tables

### `global_settings` (singleton, id=1)

Install and global app settings. One row ever. Fields: `setup_completed_at`, `created_at`, `updated_at`.

### `maintenance_settings` (singleton, id=1)

Maintenance schedule configuration. One row ever, created on first read with defaults
(`backup_enabled=false`, `backup_retention=7`). Fields:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `backup_enabled` | boolean | false | Whether the scheduled backup cron is active |
| `backup_cron` | text? | null | 5-field cron expression (e.g. `0 3 * * *`) |
| `backup_retention` | int | 7 | Keep N most-recent `*.dump` backups; `0`=keep all |
| `reindex_enabled` | boolean | false | Reserved for prompt 31 — scheduled reindex |
| `reindex_cron` | text? | null | Reserved for prompt 31 — cron for reindex |
| `created_at` / `updated_at` | timestamp | now | Standard timestamps |

Settings are admin-only. Changes are audited as `maintenance.settings_updated`.
After each backup, `pruneBackups` deletes `*.dump` files beyond the retention limit.

## Open decisions

- [ ] Do `game_modules` live as DB rows or seeded definition files? (ties to declarative-vs-code
      distribution in `module-contract.md`).
- [ ] Snapshot cadence: snapshot `game_state` every N events to bound replay cost, or replay
      from scratch (cheap at these sizes)?
- [ ] When (if ever) to partition/archive `game_events` — pick a trigger (row count / age).
- [ ] `results` denormalized onto `participations` vs. its own table.
