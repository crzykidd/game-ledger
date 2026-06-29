---
name: 27-improve-current-games
status: done
created: 2026-06-26
model: sonnet
completed: 2026-06-26
result: >
  Implemented undo-last-round via hard-delete of the latest scoring event + ScoreState
  re-materialization. Endpoint: POST /api/games/:id/undo-last-round (creator-only, 403 others).
  Fixed Skyjo negative score validation (allFilled now rejects partial "-" entry). Module info
  was already complete for all 6 games. Backend (3 new tests), frontend (4 new tests), and e2e
  (undo flow: save 2 rounds → undo → totals revert → continue → finish) all green. All existing
  suites pass. Approach logged in docs/decisions.md.
---

# Task: Improve the current games — correct-a-round, info/reference, score-entry edge cases

Polish the gameplay for the existing games. The biggest real gap is **fixing a mis-entered
round** (scorekeepers mistype and currently can't correct a saved round). Plus round out each
module's rules/reference and a few score-entry edge cases.

## Before you start

- Read `CLAUDE.md`, `docs/spec.md` (write model — append-only `game_events` + materialized
  state), `docs/module-contract.md`. The app supports numeric_rounds, rank_order, winner_pick;
  score entry is in `frontend/src/play/GamePage.tsx`; the event write is append-only
  (`game_events` → materialized `ScoreState`) with idempotency + `baseVersion` concurrency.
- Don't touch the user's live data; test on localhost / an isolated stack.

## Working tree check

`git status --porcelain` should show only `prompts/27-improve-current-games.md`. Otherwise list/ask.

## What to do

**1. Correct the last round (the key improvement).** Let the scorekeeper **undo / edit the most
recently saved round** on the active game. Implement it consistent with the append-only model:
add a backend path to revert the last `round_score`/`winner_pick` event (e.g. an "undo last
event" that appends a compensating/tombstone event or safely truncates the latest seq for the
creator), re-materialize `ScoreState`, and bump the version. Frontend: an **"Undo last round"**
(and ideally edit-and-resave) control on the score screen, creator/scorekeeper only, with a
confirm. Keep it idempotent + concurrency-safe. (rank_order is single-shot — undo there just
means re-submitting the finish order before finishing, which already works.)

**2. Score-entry edge cases.**
- **Skyjo negative scores** — round scores can be negative (cards −2..12); ensure the input +
  steppers allow negatives and totals handle them.
- Sensible validation/affordances (don't block legitimate values; clear the field cleanly).

**3. Module info/reference completeness.** Make sure **every current module** (Skyjo, Uno, Five
Crowns, President, Cards Against Humanity, Apples to Apples) has solid `info` — a concise rules
summary and a useful scoring reference shown in the collapsible panel. Fix any that are thin.

## Conventions to honor

- Append-only write model integrity (don't mutate history in place destructively without a clear,
  tested approach). Creator-only for undo (server-enforced, 403 otherwise). Keep light + dark.
  Don't regress existing flows.

## Tests (definition of done)

- Backend test: undo-last-round reverts the materialized state + version for the creator; 403 for
  a non-creator; safe when there are no rounds yet.
- Frontend test: the undo control appears for the creator and calls the endpoint; Skyjo accepts a
  negative round score.
- **e2e**: a flow that saves 2 rounds, **undoes the last**, and confirms totals/round revert; then
  continues and finishes. Existing suites stay green.
- `pnpm lint`/`build` pass; `pnpm test` (backend+frontend) green; **full e2e green** (isolated
  Postgres on a non-standard port; never `down -v` the `game-ledger` project; clean up).

## When done

1. Update frontmatter (`status`/`completed: 2026-06-26`/`result`).
2. `git mv prompts/27-improve-current-games.md prompts/done/`.
3. Log the undo approach (compensating event vs truncate) in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`feat: correct-a-round, Skyjo negatives, and richer game info`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, the undo approach + endpoint, the edge cases fixed,
   the info improvements, and the full e2e result.
