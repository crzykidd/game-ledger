---
name: 05-game-engine
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: >
  Implemented scoring-type registry (numeric_rounds + skyjo/doubling), YAML module loader with
  JSON Schema validation, Skyjo module definition, and the full game event write model
  (POST/GET /api/games, POST /api/games/:id/events with idempotency + concurrency, GET events,
  POST finish). 21 new tests pass (11 unit + 10 integration). Build and lint clean.
---

# Task: Game engine — scoring-type registry, module loader, Skyjo, event write model (backend)

The core domain: a code registry of **scoring types**, a **YAML module loader** validated by a
JSON Schema, the **Skyjo** module, the **append-only event write model** with materialized
state, and **result resolution**. Single scorekeeper. **Backend only** — play UI is prompt 07.

## Before you start

- Read `CLAUDE.md`, `docs/module-contract.md` (scoring-type registry, capture/resolution/result,
  the write model), `docs/data-model.md` (event log → materialized state → results), and the
  **Skyjo sheet** in `docs/games/catalog.md` (numeric_rounds, low-wins, target 100 finish-round,
  the cross-player end-rounder doubling rule).
- From prompt 04: participants are referenced by **`Player.id`** (guest or registered,
  uniformly); `Game.playgroupId` is optional (ad-hoc allowed). Models exist: `GameModule`,
  `Game`, `Participation`, `GameEvent` (append-only, unique `(gameId, seq)` + unique
  `clientEventId`), `ScoreState`, `GameResult`. Reuse the auth/RBAC surface.

## Working tree check

`git status --porcelain` should show only `prompts/05-game-engine.md`. Otherwise list and ask.
(Heads-up: a known pre-existing parallel-test FK-cleanup gap exists — make your NEW tests
isolation-safe; the global fix is deferred to prompt 08.)

## What to do

**Scoring-type registry (code)**
- A typed, versioned in-code registry. Each `ScoringType` declares its turn-record schema and a
  `resolve(rounds, config)` that produces per-participant totals + the normalized result, honoring
  `direction` (high/low) and `aggregate` (sum/last/…).
- Implement the **`numeric_rounds`** type: one number per participant per round, summed; supports
  an optional **`roundResolver`** hook that receives the **whole round's set** (for cross-player
  rules).
- Implement the **`skyjo/doubling`** round resolver: if the round-ender's `roundScore` is **not
  strictly the lowest** that round **and is > 0**, double it.
- Normalized result for `numeric_total`: rank by total per `direction` (Skyjo = ascending),
  `didWin = rank 1`, `score = total`.

**Module loader (YAML + JSON Schema)**
- Add the module-definition **JSON Schema** to `packages/contract`; load `/modules/<id>/module.yaml`
  on startup, **validate against the schema** (reject invalid modules with a clear error), and
  register them (into `GameModule` and/or an in-memory registry keyed by `moduleKey`+version).
- Author the **Skyjo module** at `modules/skyjo/module.yaml`:
  `players {min:2,max:8}`, `scoringType {id: numeric_rounds, version, config: {direction: low,
  aggregate: sum, roundResolver: "skyjo/doubling"}}`, `end {type: target, target: 100,
  finishRound: true}`, `result {type: numeric_total}`, plus `info` (a short rules markdown + a
  scoring quick-reference). Per-round fields: `roundScore` (int), `endedRound` (bool).

**Game lifecycle + event write model**
- `POST /api/games` {moduleKey, playgroupId?, participantPlayerIds[], config?} → validate player
  count vs the module, create `Game` (ACTIVE) + `Participation` rows (seat order). The creator is
  the **scorekeeper**.
- `GET /api/games` → caller's games; **active games for resume** distinguishable from complete.
- `GET /api/games/:id` → game + participants + current materialized `ScoreState` + version.
- `POST /api/games/:id/events` {clientEventId, baseVersion, type, payload} → the **append-only
  write**: **idempotent on `clientEventId`** (re-send returns the same result, no double-apply);
  **optimistic concurrency on `baseVersion`** (reject stale with current state); append a
  `GameEvent`, bump the game version (seq), **update materialized `ScoreState`**, return canonical
  state + new version. **Only the scorekeeper may write** (M1 single-scorekeeper).
- `GET /api/games/:id/events` → ordered events (replay/debug).
- `POST /api/games/:id/finish` (or a terminal event) → run the scoring type's resolution, write
  `GameResult` rows (normalized rank/didWin/score), set status COMPLETE + `endedAt`. Reject if
  not the scorekeeper.

## Conventions to honor

- NestJS modules/guards; `CsrfGuard` on mutations; `class-validator` DTOs; reuse contract enums.
  Build `packages/contract` before `nest build`. The scoring registry is plain TS (no DB coupling
  in the resolution math). `GameEvent` is immutable; `ScoreState` is derived (must equal a fresh
  replay). Don't build UI.

## Tests (definition of done)

Tests pass (`pnpm test`), lint clean, build green, any migration applies cleanly:
- **Skyjo end-to-end**: a multi-round game resolves correct totals + ranks (low-wins), including
  the **end-rounder doubling** rule (ender not strictly lowest & >0 → doubled; not applied when ≤0)
- **event idempotency**: re-posting the same `clientEventId` does not double-apply
- **concurrency**: a stale `baseVersion` is rejected with the current state
- **state == replay**: materialized `ScoreState` equals a from-scratch event replay
- **lifecycle**: start validates player count vs module; finish computes correct winner/ranks and
  sets COMPLETE; non-scorekeeper writes are rejected
- **module loader**: the Skyjo YAML loads + validates; a deliberately invalid module is rejected
  by the JSON Schema

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/05-game-engine.md prompts/done/`.
3. Log non-obvious choices (registry shape, resolver hook signature, version/seq scheme,
   ScoreState materialization, scorekeeper enforcement) in `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit (`feat: game engine, scoring types, Skyjo module, event write model`),
   clean message, **no AI mention**. Stage specific paths, don't push.
5. **Report back**: commit hash + message, the API surface (game start/list/get, event write,
   finish), the scoring-type/module-loader shape, and what the frontend prompts (06/07) need —
   esp. the event-write contract (clientEventId/baseVersion), current-state shape, and the Skyjo
   capture fields the score-entry UI must collect.
