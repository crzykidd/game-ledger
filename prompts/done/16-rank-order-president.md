---
name: 16-rank-order-president
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-25
result: >
  Added rank_order scoring type (separate RankOrderScoringType interface + resolveFinishOrder,
  parallel registry alongside numeric_rounds), finish-order capture event type, President module
  YAML (3-8 players, pointsMap 3/2/0), drag-to-reorder FinishOrderForm (dnd-kit + arrow buttons),
  auto-finish flow after submit, rank-only results (Score column suppressed when all scores null),
  backend tests (6), frontend tests (2 describe blocks, 9 assertions), e2e Playwright verification
  (President flow + Skyjo regression, both pass). 17 backend tests, 56 frontend tests all green.
---

# Task: rank_order scoring type + President module (a non-numeric game)

Prove the module system handles a **non-numeric** game. Add a `rank_order` scoring type
(result = finish-order ranking, no scores), a finish-order entry UI, and a President/Asshole
module. This exercises the "result type and capture primitive are independent axes" design.

## Before you start

- Read `CLAUDE.md`, `docs/module-contract.md` (scoring types; `rank_order` capture; `ranking`
  result type; `pointsMap`), and the President sheet in `docs/games/catalog.md`.
- Builds on prompt 05 (scoring-type registry, `numeric_rounds`) and 15 (capture-driven entry UI,
  multi-module picker). Reuse the polished design system. Skyjo/Uno/Five Crowns already work as
  numeric games.
- Dev DB persists admin `e2e-admin@test.local` / `E2eAdmin1!XYZ` for login (or wizard on fresh DB).

## Working tree check

`git status --porcelain` should show only `prompts/16-rank-order-president.md`. Otherwise list and ask.

## What to do

**1. `rank_order` scoring type (backend, code registry).**
- Capture = a **finish order** of the participants (rank 1..N), not numbers.
- `resolve` produces the normalized result directly from finish order: `rank` = finish position,
  `didWin` = rank 1, `score` = null (or derived from an optional `pointsMap`).
- Support an optional `pointsMap` (e.g. President 3 / VP 2 / … / Asshole 0) → when present, also
  expose points; otherwise rank-only. Result type = `ranking`.
- For M1 keep it single-round (one finish order per game). (Multi-round President + the
  playgroup "last Asshole" derived view are a future enhancement — note that, don't build it.)

**2. Finish-order entry UI (frontend).**
- The capture-driven entry UI (from prompt 15) must handle a `rank_order` capture: instead of
  numeric inputs, present a **reorderable list** (reuse the @dnd-kit drag-to-reorder from prompt
  14) where the user arranges players from 1st to last, then submits the finish order as the
  game event. Results show **rank-only** (no Score column when the game has no numeric score),
  with the winner highlighted.

**3. President module** — `modules/president/module.yaml`:
- `scoringType: rank_order`, result `ranking`, players 3–8, end `game_defined` (the scorekeeper
  records the finish order and finishes). Optional `pointsMap` for President→Asshole. `info`
  with a short rules summary.

## Conventions to honor

- Modules are DATA; the new scoring type + the finish-order entry component are the only code.
  Keep `result.type` and `capture.mode` independent (don't assume numbers). Reuse the polished
  components, keep light/dark + responsive. `pnpm lint/build/test` must pass; any migration applies.

## Verify (definition of done)

- Bring up the stack (FREE ports; say which) and **play President end-to-end in a browser**:
  start with 3–4 players → drag them into a finish order → finish → Results shows the **ranking**
  (no numeric score column), winner = rank 1. Confirm the **numeric games still work** (the
  capture-driven UI didn't regress Skyjo/Uno/Five Crowns). Capture screenshots of the
  finish-order entry + the ranking results.
- Tests: a backend test for `rank_order` resolution (rank from finish order, pointsMap optional)
  and a frontend test that a `rank_order` module renders the finish-order UI (not numeric inputs).
  Existing suites stay green.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/16-rank-order-president.md prompts/done/`.
3. Log choices (rank_order shape, finish-order UI, ranking-without-score results) in
   `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`feat: rank_order scoring type and President module`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, the rank_order approach, President verified
   end-to-end (rank-only results), and confirmation the numeric games didn't regress.
