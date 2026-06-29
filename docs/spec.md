# game-ledger — Spec (working draft)

> Status: **early draft.** Captures the concept as it stands; sections marked `TODO`
> need decisions. Nothing here is locked.

## Concept

A self-hosted app for tracking scores across the common games a group plays, over time.
Users log in, start games, record scores, and watch trends across their whole game
history. Mobile-first today; possibly a native app later.

- **Deployment:** Docker container app + a database. Runs in the homelab.
- **Primary interface:** mobile web — responsive, optimized for phone screens, minimal
  typing for fast score entry.
- **Later (maybe):** native mobile app, or a PWA (installable, offline-capable). Both are
  preserved by building **API-first** (see Architecture).

## Users, players, and guests

> Full role/permission/invite/auth design lives in **`docs/user-management.md`**. This
> section covers only the participant data model it builds on.

This is the core of the data model. There are **two kinds of participant**:

- **User** — a registered account. Logs in. Owns their game history and stats.
- **Guest** — just a *name entry* in a player list. Does **not** log in. Added ad-hoc when
  starting a game (e.g. someone who played once).

Rules captured so far:

- A user keeps a roster of **players** they commonly play with. When starting a game they
  **select existing players or add a new guest**.
- A guest can be **invited**. On accepting, the guest becomes a registered **user** — and
  their historical participation should carry over so they get their full game history.
- **History is participant-based, not creator-based:** a user sees **all games they
  participated in, regardless of who started the game**, plus **trend stats over time**
  across all of them.

### Open modeling questions (TODO)

- **Guest identity scope.** Is a guest "Bob" global, or owned by the user who added him?
  If user A and user B both add a guest "Bob," are they the same person? (Leaning:
  guests are owned by their creator's roster; merging happens only via invite/accept.)
- **Guest → user promotion / merge.** When an invited guest accepts, how do we re-link
  every past `participation` row to the new account? What if two rosters' guests turn out
  to be the same accepted user (dedupe/merge)?
- **Invite mechanism.** Email? Shareable link/code? (Drives whether we need email infra.)
- **Cross-roster visibility.** Once Bob is a user, can he see games others logged him into
  before he had an account? (Implied yes by "all games they participated in.")

## Game model — module / plugin system

Each game is a **self-contained module**. The core app knows **nothing** about any specific
game; it only knows the **module contract**. Adding a new game = adding a module. Updating a
module changes only that module — the core and other games are untouched.

- Start a **new game** with **N players** (e.g. 4), constrained by the module's
  min/max-players.
- Each slot is filled by an **existing player** (roster) or a **new guest**.

### The module contract (the core depends on this, never on individual games)

> The **concrete** contract (schema, field types, worked examples) lives in
> **`docs/module-contract.md`**. This section is the conceptual overview.

A game module is one self-contained unit declaring:

- **Identity & constraints** — `id`, `name`, `version`, min/max players.
- **Score schema** — the shape of the data captured. A small set of primitives the core can
  store and validate generically, e.g.
  - `mode`: `single` (one number per player) · `rounds` (repeated entries) · `tally`
  - `fields`: typed entry fields (int / number / bool / select) with labels + validation
- **Resolution rules** — how raw entries become a result: `direction` (higher-wins /
  lower-wins), `aggregation` (sum rounds / last value / custom), tie-breaks.
- **Normalized result** — the bridge to universal stats. Every module must emit, per
  participant, a normalized outcome (e.g. `rank`, `did_win`, optional normalized score) so
  **cross-game trends work without the core understanding each game**. This is what makes
  "stats over all my games" possible while scoring stays game-specific.
- **Entry UI & score visualization** — how a player records *and sees* scores. Two
  **decoupled layers**:
  - **Canonical score model** — the stored truth is the module's data (numeric per the
    schema). This is what's persisted, validated, and feeds stats.
  - **Presentation/skin** — a module may ship a custom **visualization** over that canonical
    score that fits the game. e.g. **Cribbage renders a pegboard with click-to-move pins**,
    but the score underneath is still numeric — the board is just a renderer + input
    affordance reading/writing the number. Default is the declarative form; custom
    visualizations are an optional per-module component. **Presentation never becomes the
    source of truth** — it's always a view over the canonical score.
- **Derived history / outcomes (optional, per module)** — a module may declare cross-game
  views over a **playgroup** (see below), beyond the universal stats. Examples: President →
  *"who was the last Asshole?"* and a rolling title holder; streaks; head-to-head records;
  per-game leaderboards. The core stores the normalized results; the module defines how to
  roll them up into these views. Scoped to a playgroup and resilient to roster changes (the
  group persists even as individual players come and go).

### Universal storage (game-agnostic)

The core stores everything generically so no migration is needed per new game:

- `games` carries `module_id` + `module_version` (never game-specific columns).
- `score_entries` hold a **JSON payload conforming to the module's schema** — the core
  validates against the schema but doesn't interpret the game.
- Computing results delegates to the module's resolution rules.

### Game state, autosave & resume

Core behavior every module gets for free — not per-module work:

- **Every game has a status:** `active` (in progress) vs `complete` (plus maybe `abandoned`).
- **Scoring state is persisted server-side and autosaved continuously** — not held only in the
  browser. Each score change is written, so nothing is lost on refresh, crash, or device
  switch.
- **Resume:** on load/refresh the app drops the user back into their in-progress game; an
  **"active games"** list lets them jump back into any unfinished game. Because state lives on
  the server (scoped to participants), resume works **across devices**.
- A custom visualization (e.g. the cribbage board) just re-renders from the saved canonical
  state — autosave/resume operate on the numeric model, not the skin.

### Write model — single scorekeeper now, multi-editor later (resolved)

**Phase 1 is single scorekeeper:** one device owns an active game; others watch via shared
leaderboard links. The write path is designed so multi-editor is an **additive** change, not a
rewrite:

- Score changes are **append-only events**: `{client_event_id (uuid), game_id, base_version,
  author, type, payload, client_ts}` — not "save whole state."
- Client applies the event **optimistically** to local state, then enqueues it (see offline).
- Server validates `base_version` (optimistic concurrency), appends to the game's event log,
  bumps the game version, acks with canonical state. **Idempotent on `client_event_id`** so
  re-sends never double-apply.
- Current game state is a **materialized row** updated by events; the event log backs sync,
  conflict detection, and **undo**.
- **Phase 1:** single writer → conflicts are rare (only cross-device); on mismatch, reload
  canonical state and replay the pending event.
- **Future multi-editor:** server **broadcasts events** to other participants (SSE/WebSocket);
  they merge by version/order. The client *write* path is unchanged — only a read/subscribe
  channel is added. No schema rework.

### Caching, sync & offline

Data is tiny and human-paced → design for **durability + offline**, not throughput.

- **Cache:** the full active game(s) (canonical numeric state), the reference data to render
  them (players, module def/config), and the "active games" list. Not other people's history.
- **Sync cadence:** event-driven — push each change, **debounced ~300–500ms**; optimistic
  local-first; flush on reconnect and on tab blur / `visibilitychange`. No polling for a single
  scorekeeper.

**Offline mode (PWA):**
- **Service worker** caches the **app shell** so the app loads with no network (needs the PWA
  path + HTTPS — TLS is at the edge; `localhost` exempt in dev).
- **IndexedDB** holds active-game state + reference data + the **outbox** (queued events). (Not
  localStorage — too small / synchronous / string-only.)
- **Outbox pattern:** events write to IndexedDB first (instant UI), queue, flush in order when
  online; idempotency via `client_event_id` makes re-sends safe. Use the **Background Sync API**
  to flush after reconnect even if the tab closed, with a **flush-on-focus/reconnect** fallback
  (iOS Safari background-sync support is limited).
- **Works offline:** load app, resume an active game, **keep scoring** (queued), view cached
  game/leaderboard. **Needs network:** first login (session), starting games needing uncached
  data, invites/resets, uncached history.
- **UI:** a clear **offline / syncing / synced** indicator so the scorekeeper trusts it.
- **(decision)** How much offline for v1 — recommend "**resilient to flaky connection
  mid-game**" (app shell + active-game-in-IndexedDB + outbox) and defer full offline-first
  (start new games entirely offline).

### Declarative vs. code modules — the key decision (TODO)

There's a spectrum; pick the primary mechanism (likely a hybrid):

| Approach | Add/update a game = | Isolation | Expressiveness |
|---|---|---|---|
| **Declarative** (game = a JSON/DSL definition: schema + rules, data only) | edit/add data, **no code deploy** | strongest — best matches "doesn't impact overall code" | bounded by the DSL |
| **Code plugin** (game = a module implementing the contract interface) | add a file in `modules/<game>/`, redeploy | strong — changes confined to the module dir | unbounded |
| **Hybrid** (declarative for the common case + optional code hook for weird scoring) | data for most, code only for exotic games | strong | unbounded where needed |

**Leaning hybrid:** declarative covers most games with zero code change; the escape-hatch
code hook handles the genuinely irregular ones — and even those are confined to one module.

### Module versioning vs. history (TODO)

Historical games were scored under a module **version**. Updating a module must not
retroactively break or silently re-score old games. Options: pin `module_version` per game
+ keep prior resolution logic, or store the **computed result** at play time so history is
immutable regardless of later module updates. Decide before the first module ships.

### Catalog (TODO)

Seeded catalog of common games (each a module) + the ability to add your own. Module
distribution (bundled with the app vs. dropped in a modules dir vs. installed) — TODO.

## Stats & history

- Per-user view of **all games they participated in**, newest first.
- **Trend stats over time** — TODO define: win rate, average score, best/worst, per-game
  breakdowns, head-to-head vs. specific players.

### Shareable leaderboards

- A leaderboard (per game, per playgroup, or per game-type) can be **shared via a link**.
- **Visibility is a per-share setting:** share with **players in that game/group only**, or
  with **anyone who has the link** (public/unlisted).
- Share links are **read-only**, use a token (reuse the typed-token mechanism from
  `docs/user-management.md`), and are **revocable**. Public/unlisted views show **nicknames
  only** (no emails), consistent with the privacy rules.
- **(decision)** link expiry (permanent vs. time-boxed); whether a public link exposes full
  game history or just final standings.

### Playgroups (the social/stats grouping)

A **playgroup** is a recurring set of players — a "core friend group." It's the lens for
group-level history and module-derived outcomes (e.g. "who was the last Asshole *in this
group*").

- A given game involves a **subset** of the playgroup (not everyone plays every game).
- The playgroup **persists across roster changes** — players are added/removed over time, but
  it's still the same group, and its history/leaderboards carry forward.
- Members can be **users or guests** (the no-login named players).
- This is **distinct from permission groups** in `docs/user-management.md` — those govern
  *access rights*; playgroups govern *social/stats grouping*. (The "social isolation" question
  flagged there is really about playgroups.)

**(decision / open):**
- Is a game always tied to exactly one playgroup, or can it be ad-hoc (no group)?
- Who creates/owns a playgroup; who can add/remove members?
- Do stats roll up at **playgroup** level, **per-user** level, or both? (Likely both: a user's
  personal trends *and* group leaderboards.)
- Nickname uniqueness may be **per-playgroup** rather than global (see `user-management.md`).

## Architecture (proposed, not locked)

- **API-first backend** so a future native app / PWA reuses the same API with no rewrite.
- **Relational DB** (Postgres in a container; SQLite a possible simpler alternative).
  Sketch of core tables:
  - `users` — registered accounts (auth).
  - `players` — roster entries; either linked to a `user` or a standalone guest name.
  - `playgroups` — a recurring friend group (see Playgroups).
  - `playgroup_members` — join: which players belong to a playgroup (persists across roster
    changes).
  - `games` — a game instance (`module_id`, `module_version`, optional `playgroup_id`,
    created_by, started_at, status) — no game-specific columns; the module defines the shape.
  - `participations` — join: which players were in which game (this is what history queries
    key off of).
  - `game_events` — append-only log of score-change events (`client_event_id`, `base_version`,
    payload…); backs sync, offline outbox replay, conflict detection, and undo.
  - `score_entries` — the **materialized** current score state per participation (derived from
    `game_events`), generic JSON validated against the module's score schema.
  - `results` (or denormalized onto `participations`) — the module's **normalized outcome**
    per participant (rank / did_win / score), so cross-game stats don't re-run game logic.
- **Auth:** **local accounts, invite-only** (no open signup), with roles/permissions. Full
  design in `docs/user-management.md`. (SSO/OIDC is out of scope for v1.)
- **Frontend — responsive + theming:**
  - **Two display formats from one app:** a **wide/browser** layout and a **streamlined
    mobile** view. Responsive breakpoints driving distinct layouts (not just reflow) — mobile
    optimized for fast, low-typing score entry; wide view can show more (history tables,
    multi-game stats) at once.
  - **Light / dark themes**, with a **per-user setting**; **default = follow system**
    (`prefers-color-scheme`). Persist the choice on the user's account.
  - Big touch targets, minimal typing on mobile.
  - **Design system + module UI:** a shared **theme-token + themed-widget library** underpins
    everything; modules adapt their UI via three tiers (auto-form → declarative layout → custom
    component like a cribbage board) all built on that system, so every game stays on-theme and
    responsive. Full model in `docs/module-contract.md` → PresentationSpec.

### Deployment topology

Separate containers, with a **prebuilt (unmodified) nginx** as the single ingress to limit
the code that runs at the edge / reduce exposure:

```
            ┌─────────────────────────────────────────┐
 (prod)     │  Traefik  — SSL termination + routing    │   ← homelab edge
 Internet ─▶│           (does not exist in dev)        │
            └───────────────────┬─────────────────────-┘
                                ▼
                    ┌──────────────────────┐
                    │  nginx (prebuilt)     │   serves static frontend assets;
                    │  single ingress       │   reverse-proxies /api → backend
                    └─────┬───────────┬─────┘
                          ▼           ▼
              ┌────────────────┐  ┌──────────────────┐
              │  frontend      │  │  backend (API)   │   not directly exposed
              │  static build  │  │                  │
              └────────────────┘  └────────┬─────────┘
                                           ▼
                                  ┌──────────────────┐
                                  │  db (Postgres)   │
                                  └──────────────────┘
```

- **nginx (prebuilt):** the only edge component, config-only, no custom code →
  smaller attack surface. Serves the built frontend and proxies `/api` to the backend.
  The backend and db are **not** directly exposed.
- **Traefik (prod only):** sits in front of nginx for SSL termination + routing at the
  homelab edge. Not present in dev (nginx is the top of the dev stack).
- **Containers:** `nginx`, `frontend` (static build), `backend`, `db` — wired in
  `docker-compose`. (frontend assets may instead be baked into the nginx image at build
  time; decide during stack setup.)

### Stack — TODO (decision pending)

Note: "prebuilt nginx serving **static** frontend assets" nudges toward a **SPA + separate
API backend** rather than a server-side-rendered (SSR) framework — an SSR app needs a
Node server container running custom code at the edge, which is exactly what the nginx
pattern is trying to avoid.

| Option | Notes |
|---|---|
| **SPA (React/Vite or Svelte) + API backend** | Fits the static-frontend-behind-nginx model cleanly. API backend can be Python (FastAPI), Node (Fastify/Express), or Go. **Leaning here** given the topology. |
| TypeScript full-stack SSR (SvelteKit / Next.js) | Best one-language/PWA story, but SSR means a Node server at the edge — in tension with the prebuilt-nginx goal unless run purely as a static export. |
| Python FastAPI + SPA frontend + Postgres | Matches the AmmoLedger pattern (ruff/pytest/Alembic); API-first; two languages. |

## Engineering / ops

- **Source:** GitHub — `github.com/crzykidd/game-ledger` (public, MIT).
- **Standards adopted:** `code-checkin-and-pr` @ 1.2.0 (fully), `handoff-prompt-workflow`
  @ 2.0.0. (`release-prep-and-cut` deferred — no release process yet.)
- **CI:** GitHub Actions (`.github/workflows/`). SAST via **CodeQL** (public GitHub).
- **Images:** published to GitHub Container Registry (ghcr.io).

## Open questions (rollup)

- [ ] Stack choice (table above).
- [ ] DB: Postgres vs. SQLite.
- [ ] Flexible scoring schema shape.
- [ ] Guest identity scope + invite/merge mechanics.
- [ ] Auth: **resolved** — local invite-only accounts (see `docs/user-management.md` for the
      open sub-decisions: login identifier, soft-delete, permission depth, bootstrap).
- [ ] Native app vs. PWA for the "later" mobile path.
- [ ] Theming/layout: wide vs. mobile as distinct layouts or responsive reflow; per-user theme
      (light/dark/follow-system) persisted on the account.
