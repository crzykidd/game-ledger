---
name: 25-winner-pick-modules
status: done
created: 2026-06-26
model: sonnet
completed: 2026-06-26
result: >
  Added winner_pick scoring type (dedicated WinnerPickScoringType with
  resolveWinnerPick(); backed by round accumulation where winner gets +1).
  Added WinnerPickForm in GamePage (tap-to-select single winner per round,
  running totals + target progress). Added modules: cards-against-humanity
  (target 7, 3-20 players) and apples-to-apples (target 5, 4-10 players).
  Backend tests: 22 pass. Frontend tests: 65 pass. E2e: 14/14 pass.
---

# Task: Add the `winner_pick` capture + Cards Against Humanity / Apples to Apples modules

Add support for **judge/party games** where each round one player is picked as the winner and
earns a point. This is a new capture style; reuse the numeric aggregation/result where it fits.

## Before you start

- Read `CLAUDE.md`, `docs/module-contract.md` (scoring types, capture modes, the `winner_pick`
  archetype) and the Cards Against Humanity sheet in `docs/games/catalog.md`.
- The app at commit `4f83f2d` already supports `numeric_rounds` (Skyjo/Uno/Five Crowns) and
  `rank_order` (President) with a **capture-driven entry UI** (`GamePage.tsx`) and a module
  loader that validates YAML against a JSON Schema. Study how `rank_order` was added (backend
  registry + entry UI + results) — follow that pattern.
- Don't touch the user's live data; test on localhost / an isolated stack.

## Working tree check

`git status --porcelain` should show only `prompts/25-winner-pick-modules.md`. Otherwise list/ask.

## What to do

**1. `winner_pick` capture.** Each round, the scorekeeper picks exactly ONE winner among the
participants; that player gets +1 (others 0). Cumulative; **highest total wins**; end on a
**target** score (configurable). Implement cleanly — it's fine to back this with the existing
`numeric_rounds` aggregation (emit a round where the picked player scores 1, others 0) plus a
new **entry-UI mode** in the capture-driven `GamePage`, OR a dedicated `winner_pick` scoring
type if that's cleaner. Your call — but the result must be `numeric_total` (high-wins, =win count).

**2. Entry UI.** A round entry that shows the participants and lets the scorekeeper **tap/select
the round's winner** (single-select), then submit to award the point and advance the round.
Running totals + "first to N" progress shown. Mobile-first, on the new Tailwind/shadcn foundation.

**3. Modules** (`modules/<id>/module.yaml`, validated by the JSON Schema, with `info` rules + a
short reference):
- **Cards Against Humanity** — `winner_pick`, target default 7 (configurable variant), players
  3–20.
- **Apples to Apples** — `winner_pick`, target default 4–7, players 4–10.

## Conventions to honor

- Reuse the established module/scoring/entry patterns; modules are DATA (YAML). Keep
  `result.type`/capture independent. The picker, numeric, and rank entry UIs must all keep
  working (don't regress Skyjo/Uno/Five Crowns/President). Light + dark, responsive.

## Tests (definition of done)

- Backend test for `winner_pick` resolution (winner gets the point; highest total wins).
- Frontend test that a `winner_pick` module renders the single-winner picker (not numeric inputs).
- **A new e2e** (`cah-happy-path` or similar): start CAH → pick winners across ≥2 rounds → finish
  at target → highest-wins results. Existing suites stay green.
- `pnpm lint`/`build` pass; `pnpm test` (backend+frontend) green; **full e2e green** (isolated
  Postgres on a non-standard port; never `down -v` the `game-ledger` project; clean up).

## When done

1. Update frontmatter (`status`/`completed: 2026-06-26`/`result`).
2. `git mv prompts/25-winner-pick-modules.md prompts/done/`.
3. Log the winner_pick approach in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`feat: winner_pick capture + Cards Against Humanity and Apples to Apples`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, the winner_pick approach (reuse vs new type), the
   modules added, the e2e result, and how the entry UI works (for the next modules prompt).
