---
name: 26-module-batch
status: done
created: 2026-06-26
model: sonnet
completed: 2026-06-26
result: >
  Added 11 new game modules (Hearts, Phase 10, Spades, Gin Rummy, Crazy Eights, Yahtzee,
  3UP 3DOWN, Big Two, Exploding Kittens, Coup, Liar's Dice). All 11 are pure-data YAML modules
  using existing scoring types. Module-loader unit tests (52 passing), backend non-DB unit tests
  (48 passing), frontend tests (65 passing), and all 17 e2e tests green. Simplifications noted in
  docs/decisions.md. Total playable games: 17.
---

# Task: Add a batch of base-level game modules (numeric + rank/elimination)

Chew through a pile of new games at **base level** — playable score tracking using the existing
scoring types, no custom visualizations. Most are pure-data YAML modules; a couple may need a
small entry-UI label tweak. The goal is breadth: get many real games trackable.

## Before you start

- Read `CLAUDE.md`, `docs/module-contract.md`, and the relevant sheets in `docs/games/catalog.md`.
- The app supports `numeric_rounds` (high/low, target/fixed_rounds, per-round config),
  `rank_order` (finish order → ranking results), and (from prompt 25) `winner_pick`. The module
  loader validates YAML against the JSON Schema; the entry UI is capture-driven. Adding a game
  that fits an existing type is **pure data**.
- **"Base level"** = correct win-direction + end condition + per-round capture, with `info` rules
  + a short scoring reference. Where a real game's scoring is intricate (Yahtzee categories,
  Hearts shooting-the-moon, Spades bags), **simplify to a per-round/total number and NOTE the
  simplification in the module's info**. Don't build bespoke logic.
- Elimination/last-standing games map to **`rank_order`**: the scorekeeper records the finish
  order (winner / last-standing at top). Reuse it; if a clearer "elimination order" label helps,
  add a light per-module label hint — no new backend type.
- Don't touch the user's live data; test on localhost / an isolated stack.

## Working tree check

`git status --porcelain` should show only `prompts/26-module-batch.md`. Otherwise list/ask.

## What to do

Add these modules (`modules/<id>/module.yaml`, each schema-validated, with `info` rules + a
scoring reference). Adjust player counts/targets to sensible real values:

**numeric_rounds — low-wins**
- **Hearts** — penalty points (hearts + Q♠), ends ~100, 3–6 players. (Note: shoot-the-moon not modeled.)
- **Phase 10** — penalty points for unplayed cards each round; ends when a player finishes phases. 2–6.

**numeric_rounds — high-wins**
- **Spades** — partnership/individual bid+trick points, first to ~500. (Note: bags simplified.)
- **Gin Rummy** — deadwood/gin points, first to 100, 2 players.
- **Crazy Eights** — points from opponents' leftover cards, first to ~100–500, 2–6.
- **Yahtzee** — one number per player (their final total); 2–10. (Base level: enter the final
  total; category scoring not modeled — note this.)

**rank_order (finish order / elimination)**
- **3UP3DN** — shedding, finish order, 2–6.
- **Big Two** — shedding, finish order, 4.
- **Exploding Kittens** — last player standing → finish order, 2–5.
- **Coup** — last player standing → finish order, 2–6.
- **Liar's Dice** — last player standing → finish order, 2–6.

## Conventions to honor

- Modules are DATA. Don't regress existing games or the entry/picker/results UIs. Keep light +
  dark. If any game truly doesn't fit an existing type, SKIP it and note why in the report
  (don't force it or invent a half-baked type).

## Tests (definition of done)

- The module loader loads all new modules (schema-valid); add a backend test asserting they
  register and resolve with the correct win-direction.
- **e2e**: pick 2–3 representative new games (one low numeric, one high numeric, one rank/elim)
  and play each end-to-end (start → enter rounds / finish order → correct results). Existing
  suites stay green.
- `pnpm lint`/`build` pass; `pnpm test` (backend+frontend) green; **full e2e green** (isolated
  Postgres on a non-standard port; never `down -v` the `game-ledger` project; clean up).

## When done

1. Update frontmatter (`status`/`completed: 2026-06-26`/`result`).
2. `git mv prompts/26-module-batch.md prompts/done/`.
3. Log any simplifications/skips in `docs/decisions.md`; update `docs/games/catalog.md` status if useful.
4. **Commit on `dev`** — ONE commit (`feat: add base-level modules — Hearts, Spades, Phase 10, Gin, and more`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, the modules added (and any skipped + why), the e2e
   result, and the full count of playable games now.
