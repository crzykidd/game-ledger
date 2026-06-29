---
name: 35-cribbage-module
status: done
created: 2026-06-27
model: sonnet
completed: 2026-06-27
result: >
  Created modules/cribbage/module.yaml (numeric_rounds, high/sum, target 121, players 2-3,
  finishRound: false, single roundScore field). Added 14-test spec
  module-loader.cribbage.spec.ts (all pass). Updated module-loader.spec.ts EXPECTED_MODULES
  to include cribbage (76 tests pass). Updated docs/decisions.md.
---

# Task: Cribbage game module (numeric_rounds, race to 121, 2–3 players)

Add a **Cribbage** game module. Scoring needs no new engine code — it's the existing
`numeric_rounds` type (highest total wins, running sum), one number entered per hand. This is the
backend half; the custom two-peg board visual is prompt 36 (`36-cribbage-board.md`), which depends
on this module existing.

## Before you start

- Read `CLAUDE.md` (stack, conventions, **no AI mention in commits**, one prompt = one commit on
  `dev`). Skim `docs/module-contract.md` (module YAML contract) and `docs/games/catalog.md`.
- Look at `modules/uno/module.yaml` — it is the **closest template**: `numeric_rounds`,
  `direction: high`, `aggregate: sum`, a single `roundScore` integer field, `end.type: target`.
  Cribbage is Uno with a different target, player range, and info text.

## Working tree check

`git status --porcelain` should be clean apart from this prompt file (exempt). The untracked file
`prompts/36-cribbage-board.md` will also be present — **leave it alone**, it is the next prompt and
must NOT be part of your commit. List/ask about any other unexpected dirty files.

## Codebase facts (researched — trust these)

- **Modules are YAML in `modules/<id>/module.yaml`**, validated against a JSON Schema at backend
  boot by `ModuleLoaderService` (`backend/src/module-loader/module-loader.service.ts`). The
  **module loader runs at backend boot** — a newly added module only loads on backend restart.
- **`numeric_rounds` already does everything cribbage needs** (`backend/src/scoring/scoring-type.registry.ts`):
  `direction: high` + `aggregate: sum` accumulates each hand's points; highest total wins; ties share
  a rank. No new scoring type, no round resolver.
- **`end.target` is advisory, not enforced.** Games finalize via an explicit "complete" action in
  `games.service.ts` (sets `status: COMPLETE`, runs `resolve`); `target` is metadata the UI surfaces,
  it does not auto-end the game. So "first to 121 wins" works naturally: the scorekeeper stops
  entering hands and finalizes when someone crosses 121, at which point highest-total == first-to-cross.
  Use `finishRound: false` (cribbage is won the instant 121 is reached, mid-hand — not at round end).
- **Field shape:** copy Uno's single field — `name: roundScore`, `type: integer`, `required: true`.
  Label it for cribbage (e.g. `Points this hand`). Do NOT add an `endedRound` field (that's a
  Skyjo-only thing for its doubling resolver; cribbage has no resolver).
- **`info`** has `summary`, `rules`, `scoring` (markdown) — see Uno/Skyjo. This is shown in the
  game's info/reference tab.

## What to do

1. Create `modules/cribbage/module.yaml`:
   - `id: cribbage`, `name: Cribbage`, `version: "1.0.0"`.
   - `players: { min: 2, max: 3 }`.
   - `scoringType: { id: numeric_rounds, version: "1.0.0", config: { direction: high, aggregate: sum } }`.
   - `end: { type: target, target: 121, finishRound: false }`.
   - `result: { type: numeric_total }`.
   - `fields:` single `roundScore` integer, required, label `Points this hand`.
   - `info.summary` / `info.rules` / `info.scoring` — accurate cribbage content. Cover at minimum:
     - **Goal:** first player to **121** points (twice around a standard board) wins.
     - **Players:** 2 (classic, 6 cards each) or 3 (deal 5 each + 1 to the crib, each discards 1 to
       the crib; play for yourself; dealer rotates left). This module tracks **per-player** scores
       (no partnership play).
     - **A hand:** the deal → discard to the crib → **the play (pegging)** → **the show** (count
       hands, then the dealer counts the crib). You enter **one number per player per hand** = the
       total they pegged + counted that hand.
     - **Skunk:** a player who fails to reach **91** when the winner hits 121 is *skunked* (counts as
       a double win in some scoring); failing to reach **61** is a *double skunk*. (Tracked
       visually in prompt 36 — mention the 91/61 lines here.)
   - `info.scoring` quick-reference of point sources (these are the error-prone bits — get them
     right): **fifteen** = 2 (each combo summing to 15), **pair** = 2 (3-of-a-kind = 6, 4 = 12),
     **run** = 1 per card (min 3), **flush** = 4 (all four hand cards same suit; 5 with the starter;
     crib flush needs all 5), **his nobs** = 1 (jack in hand/crib matching the starter's suit),
     **his heels/nibs** = 2 (dealer cuts a jack as the starter). In **the play**: **fifteen** = 2,
     **thirty-one** = 2, **go / last card** = 1, **pairs/runs** as pegged.
2. Confirm it loads: the loader validates against the schema — make the YAML schema-valid (compare
   field-for-field against `modules/uno/module.yaml` and whatever the schema requires). If any
   required top-level key exists in other modules but not Uno, include it.

## Conventions to honor

- Match the structure and key order of existing `module.yaml` files. YAML, 2-space indent.
- Additive only — no changes to the scoring registry, loader, or other modules.

## Tests (definition of done)

- Add a unit spec (Jest, `*.spec.ts`, mock-Prisma / no-DB style like
  `backend/src/module-loader/module-loader.play-counts.spec.ts`) that:
  - Loads the real modules dir and asserts the `cribbage` module is registered with
    `scoringType.id === 'numeric_rounds'`, `config.direction === 'high'`, `players.min === 2`,
    `players.max === 3`, `end.target === 121`.
  - Drives `numeric_rounds.resolve(...)` (or the module-loaded scoring type) with a **3-player**
    set of hands and asserts the player who crosses 121 first / has the highest total is ranked 1
    (`didWin: true`) and totals sum correctly. Reuse the resolve-test pattern in
    `backend/src/scoring/*.spec.ts` if one exists.
- The module loader / existing module tests must still pass. Run the backend suite per
  `prompts/startnewsession.md` (isolated throwaway DB for the full run; your new spec mocks Prisma
  and needs no DB).

## When done

1. Update this file's frontmatter (`status: done`, `completed: 2026-06-27`, `result`); `git mv` it
   into `prompts/done/`.
2. `docs/decisions.md` (newest at top): note cribbage ships as `numeric_rounds` high/sum, target 121
   advisory, 2–3 players, no partnership play, single points-per-hand field.
3. **One commit on `dev`** (`feat:`, no AI mention), specific paths only (the new module dir, the new
   spec, `docs/decisions.md`, this moved prompt) — **do not** stage `prompts/36-cribbage-board.md`.
   No push. Report hash / files / message, and confirm for prompt 36: the module `id` is `cribbage`,
   the per-hand field is `roundScore`, target is 121, players 2–3, and the ScoreState the board will
   read is `scoreState.payload.rounds` (`Array<{round, scores: Record<participationId, number>}>`)
   plus `scoreState.payload.totals` (`Record<participationId, number>`).
