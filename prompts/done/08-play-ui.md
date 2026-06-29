---
name: 08-play-ui
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: Play UI complete — players/playgroups management, Skyjo game start/play/finish/results, history, all tests passing.
---

# Task: Play UI — playgroups/players, Skyjo play, autosave/resume, results, history

The capstone M1 feature: the screens to manage playgroups/players, start and **play a Skyjo
game** (score entry with server autosave + resume), finish to a results screen, and see basic
history. Built on the prompt-06 design system + the prompt-05 game API. **No offline/PWA** (M1
defers it) — autosave is server-side per round.

## Before you start

- Read `CLAUDE.md`, `docs/spec.md` (game flow, autosave/resume, the score-keeping presentation),
  the **Skyjo sheet** in `docs/games/catalog.md`, and the prompt-05 report's frontend contract.
- Reuse prompt-06: widget library, `useAuth()`, `apiClient`, routing, theme tokens (no hardcoded
  colors). Follow patterns prompt 07 established for list/detail/modal screens.
- Backend: players/playgroups (prompt 04) and the game engine (prompt 05).

## Working tree check

`git status --porcelain` should show only `prompts/08-play-ui.md`. Otherwise list and ask.

## Key backend contracts (from prompt 05)

- **Start:** `POST /api/games` `{moduleKey, playgroupId?, participantPlayerIds[], config?}`.
- **State:** `GET /api/games/:id` → game + participants + `version` + ScoreState
  `{ rounds: [{round, scores:{participationId: rawScore}}], totals:{participationId: total} }`.
- **Write a round (autosave):** `POST /api/games/:id/events`
  `{ clientEventId: UUID, baseVersion, type:"round_score", payload:{ round, scores:[{participationId, roundScore, endedRound}] } }`
  → `{event, version, scoreStates}` (or `{idempotent:true, version, scoreStates}` on re-send);
  stale `baseVersion` → **409** `{currentVersion, scoreStates}`.
- **Finish:** `POST /api/games/:id/finish` → writes results, status COMPLETE.
- **List:** `GET /api/games` (ACTIVE vs COMPLETE). Skyjo: low-wins, target 100, per-round fields
  `roundScore` (int) + `endedRound` (bool).

## What to do

**Players & playgroups UI** (backend prompt 04): manage the caller's **roster** (add/rename guest
players) and **playgroups** (create, rename, add/remove members — guests or registered).

**Start a game:** pick the module (Skyjo), optionally a playgroup, select participants (pre-filtered
from the playgroup, or the full roster for ad-hoc), seat order → `POST /api/games`.

**Play (score entry):** the Skyjo round-entry screen, mobile-first:
- Per round, capture each participant's `roundScore` (number stepper / numeric input — minimal
  typing, big touch targets) and a single **"ended the round"** selector (`endedRound`).
- Show the live **running totals** from ScoreState; indicate low-wins + progress toward 100.
- **Autosave per round:** generate a `clientEventId`, send the event with the current `version` as
  `baseVersion`, apply the returned `scoreStates`/`version` optimistically. On a **409**, reload
  with the returned current state and let the user retry (single scorekeeper, so rare).
- **Resume:** an "Active games" list; opening one reloads its state and continues from the
  current round (state lives on the server).

**Finish & results:** end the game (`/finish`) → a **results screen** with final ranks + winner
(ascending for Skyjo). 

**History & stats (basic):** a per-user list of games played (newest first) with outcome, and a
couple of simple stats (e.g. games played, wins). Reference players by nickname.

**Skyjo info/reference:** surface the module's `info` — a rules/directions view and a collapsible
**"Scoring reference"** panel (collapsed on mobile) near the score sheet.

## Conventions to honor

- React + Vite + TS; reuse `packages/contract` + the prompt-06/07 components/patterns. Mobile-first
  with a wide layout; theme tokens only. Keep score entry fast (steppers, few taps).
- Autosave is **server-side per round** (no IndexedDB/offline this milestone). Always send
  `baseVersion` and handle the 409 path. `clientEventId` must be a fresh UUID per round submission
  (idempotent retries reuse the same id).

## Tests (definition of done)

`pnpm lint`/`pnpm build`/`pnpm test` (frontend) green:
- start-game flow posts the right body (module, participants)
- score-entry submits an event with `clientEventId` + `baseVersion`; totals update from the response
- a 409 stale-version response reloads state (handled, not crashed)
- resume loads an active game's current state
- finish navigates to results showing the correct (low-wins) winner
- history lists games for the user; the Skyjo reference panel renders (collapsed on mobile)

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/08-play-ui.md prompts/done/`.
3. Log non-obvious choices (score-entry UX, autosave/version handling, resume, history shape) in
   `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit (`feat: play UI — playgroups, Skyjo play, results, history`),
   clean message, **no AI mention**. Stage specific paths, don't push.
5. **Report back**: commit hash + message, the screens/routes added, and anything prompt 09
   (integration/e2e) needs to drive the full flow (selectors, route paths, the happy-path steps).
