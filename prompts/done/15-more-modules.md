---
name: 15-more-modules
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-25
result: >
  Generalized the score-entry UI to render from each module's capture metadata via a new
  GET /api/modules endpoint. ScoreForm shows the ended-round toggle only when a module declares
  an endedRound boolean field; leader highlight + Final Rankings order + win-direction subtitle
  come from scoringType.config.direction; header progress reflects target vs fixed_rounds; the
  start-game picker lists all loaded modules with per-module player-count validation. Added Uno
  (numeric_rounds, high-wins, target 500, 2-10 players) and Five Crowns (numeric_rounds, low-wins,
  fixed_rounds 11, 1-7 players, per-round wild rank hint). No engine changes were needed — the
  numeric_rounds type already handles both directions and end conditions are a display concern.
  Added backend integration tests (Uno high-wins, Five Crowns fixed-11 low-wins) and frontend tests
  (Uno renders no ended-round toggle, Five Crowns shows the wild-rank hint). All three games verified
  end-to-end in a real browser with correct win-direction ordering. lint/build/test all pass
  (frontend 54, backend 118).
---

# Task: Generalize the play UI + add two more game modules (Uno, Five Crowns)

Prove the module system is genuinely multi-game. Make the score-entry UI render from each
module's **capture schema** (instead of being Skyjo-specific), then add two more
`numeric_rounds` modules that exercise different config (high-wins/target vs low-wins/fixed
rounds). Verify each plays end-to-end.

## Before you start

- Read `CLAUDE.md`, `docs/module-contract.md` (scoring types, capture/resolution/end/result,
  the YAML module shape + info/reference), and the catalog sheets for **Uno** and **Five Crowns**
  in `docs/games/catalog.md`.
- Builds on prompts 05 (game engine: `numeric_rounds`, module loader, end conditions) and 14
  (polished play UI). Skyjo already works: `modules/skyjo/module.yaml`, scoring type
  `numeric_rounds` + `skyjo/doubling` resolver. Reuse the polished design-system components.

## Working tree check

`git status --porcelain` should show only `prompts/15-more-modules.md`. Otherwise list and ask.

## What to do

**1. Generalize the score-entry UI (capture-driven).**
- The score-entry screen must render its per-round inputs from the **module's declared capture
  fields** (the scoring type's `turnSchema` / module config), not hardcoded Skyjo fields.
  - Skyjo: `roundScore` (int) + `endedRound` (bool, pick-one). Uno: a single `roundScore` (int),
    no ended-round. Five Crowns: `roundScore` (int), and show the round's wild rank from per-round
    config as a label/hint.
- Respect `result.direction` (low-wins vs high-wins) for the leader highlight + Final Rankings
  ordering, and the `end` condition for progress display (target score vs fixed N rounds).
- The start-game **module picker** must list ALL loaded modules (not assume Skyjo), with correct
  min/max player validation per module.

**2. Backend: ensure the engine supports both end conditions** used below — `target` (first to N,
finish the round) and `fixed_rounds` (exactly N rounds) — and per-round `config` (Five Crowns'
changing wild). Add/extend resolution + tests if `fixed_rounds` or per-round config wasn't fully
wired in prompt 05.

**3. Add the modules** (YAML in `modules/<id>/module.yaml`, validated by the existing JSON Schema,
with `info` rules + a short scoring reference):
- **Uno** — `numeric_rounds`, **high-wins**, end `target` (default 500, a configurable variant),
  players 2–10. Per round, the hand winner records points from opponents' cards (one `roundScore`
  int per player/round). No resolver.
- **Five Crowns** — `numeric_rounds`, **low-wins**, end `fixed_rounds: 11`, players 1–7. Per round,
  record each player's penalty points (`roundScore` int); show the round's wild rank
  (3s→Ks across rounds 1–11) from per-round config as a hint. No cross-player resolver.

## Conventions to honor

- Modules are DATA (YAML); only the engine/UI generalization is code. Reuse the polished
  components from prompt 14. Keep light/dark + responsive. `pnpm lint/build/test` must pass; any
  migration applies cleanly.

## Verify (definition of done)

- Bring up the stack (FREE ports; say which) and **play each of the three games end-to-end in a
  browser**: Skyjo (low, target 100, doubling), Uno (high, target 500), Five Crowns (low, fixed
  11 rounds) — start → enter rounds → finish → Final Rankings order correct for each game's win
  direction. Capture a screenshot of each game's score-entry + results.
- Module picker shows all three; player-count validation per module works.
- Tests: a backend test per new module/end-condition (incl. correct ranking direction) and a
  frontend test that the capture-driven entry renders different fields for different modules.
  Existing suites stay green.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/15-more-modules.md prompts/done/`.
3. Log choices (capture-driven entry approach, end-condition handling) in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`feat: capture-driven score entry + Uno and Five Crowns modules`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, the generalization approach, the three games verified
   end-to-end (with win-direction correctness), and any engine changes needed for the end
   conditions.
