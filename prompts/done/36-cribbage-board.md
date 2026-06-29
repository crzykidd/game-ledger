---
name: 36-cribbage-board
status: done
created: 2026-06-27
model: sonnet
completed: 2026-06-28
result: >
  Presentation registry + CribbageBoard SVG implemented. Registry at
  frontend/src/play/presentation/index.ts (getBoardComponent keyed by base module id).
  Board at frontend/src/play/presentation/CribbageBoard.tsx — SVG with per-player tracks,
  two-peg leapfrog (front filled, rear hollow), street tick marks every 5, dashed skunk
  lines at 61/91, finish line at 121, Framer Motion spring animation on front peg,
  useReducedMotion respected, winner flagged at target. GamePage wired to show board above
  Running Totals for any registered module (strips @version from moduleKey). 15 new Vitest
  tests (91 total); tsc --noEmit clean. docs/decisions.md + startnewsession.md updated.
---

# Task: Cribbage board — two-peg leapfrog visual + a per-module presentation hook

Give the Cribbage game an authentic **cribbage board** view: a 2–3 track board with the classic
**two-peg leapfrog** per player (rear peg = score before this hand, front peg = current score, the
gap = the hand just scored), **skunk lines at 91 and 61**, and a finish at **121**, animated as
pegs advance. Build it behind a small **presentation registry** (module id → optional board
component) so future games can plug in their own visuals — this is the first per-game visual
treatment (see `prompts/startnewsession.md` → "Per-game visual treatments").

The board is **display-only**: do not change score entry, the scoring engine, or any backend code.

## Before you start

- Read `CLAUDE.md`. Confirm prompt 35 landed (`modules/cribbage/module.yaml`, module `id: cribbage`,
  `numeric_rounds`, target 121, players 2–3, per-hand field `roundScore`) — check `prompts/done/` and
  its report / `docs/decisions.md`. The backend must be restarted for the module to load; verify the
  app is serving it before relying on it (the module loader runs at boot).
- Read `frontend/src/play/GamePage.tsx` end to end — especially how it branches the in-progress UI by
  `moduleInfo?.scoringType?.id` and how it reads totals/rounds. You are **adding** a board into the
  cribbage in-progress view, not rewriting the page.

## Working tree check

`git status --porcelain` should be clean apart from this prompt file (exempt). List/ask about any
unexpected dirty files this plan touches.

## Codebase facts (researched — trust these)

- **GamePage dispatches by scoring type, not module id** (`frontend/src/play/GamePage.tsx`):
  `isRankOrder` checks `moduleInfo?.scoringType?.id === 'rank_order'` (~line 79), `isWinnerPick`
  similarly (~line 84); the numeric path is the default. There is **no presentation layer yet** — you
  are introducing it.
- **Per-participation ScoreState payload** (numeric games): each participation carries
  `scoreState.payload.rounds` = `Array<{ round: number; scores: Record<participationId, number> }>`
  and `scoreState.payload.totals` = `Record<participationId, number>` (confirmed in
  `backend/src/games/games.service.ts`, and read in GamePage as `p.scoreState?.payload?.rounds` /
  `?.totals`). From these, per player `pid`:
  - **current total / front peg** = `totals[pid]`.
  - **last hand delta** = the `scores[pid]` of the last round in `rounds` (0 / no peg-move if no
    rounds yet).
  - **rear peg** = `totals[pid] - lastDelta`.
  - (Per-round cumulative, if you want a trail, = running sum of `scores[pid]` across `rounds`.)
- **Player display names / participations:** reuse exactly how GamePage already renders names in its
  standings table (it maps over `participations` and shows each player's name) — don't invent a new
  data path. The board needs: ordered participations, each player's name, and the two peg values.
- **Framer Motion is already in the stack** (used in `frontend/src/components/ui/` / `AppShell`).
  Use it to animate the front peg sliding to its new hole when a hand is added. Respect
  `prefers-reduced-motion` if the existing components establish a pattern.
- **UI conventions:** Tailwind, slate surfaces + indigo accent, paired `dark:` variants; `cn` from
  `frontend/src/components/ui/utils`. Match the app look.
- **Tests:** Vitest + Testing Library; pattern in `frontend/src/play/play.test.tsx` (`stubFetch`
  URL→JSON, `/api/auth/me` drives auth). SVG is testable via `data-testid` + asserting attributes.

## What to do

1. **Presentation registry (the reusable hook).** Create `frontend/src/play/presentation/` with:
   - `index.ts` exporting `getBoardComponent(moduleId: string): React.ComponentType<BoardProps> | null`
     (returns the cribbage board for `'cribbage'`, `null` otherwise). Keep `BoardProps` a small,
     generic contract (participations + a way to read each player's total and last-hand delta + the
     target) so future modules can register without reshaping it.
   - `CribbageBoard.tsx` implementing the board.
2. **CribbageBoard.tsx** — an SVG cribbage board:
   - **One track per player** (2 or 3, from the participation count), laid out as the classic
     serpentine **streets of five holes** up to **121** (a 120-hole track + the final game hole is
     fine; don't obsess over physical hole-exact geometry — read as a cribbage board, grouped in 5s,
     with a clear start and a 121 finish).
   - **Two pegs per player**: rear peg at `total - lastDelta`, front peg at `total`. When a new hand
     lands, the old front peg becomes the rear and the new front animates forward (Framer Motion).
     With no rounds yet, both pegs sit at the start.
   - **Skunk lines**: a marked line at **91** (skunk) and **61** (double skunk), plus the **121**
     finish — labelled/legible. Use distinct, subtle styling (e.g. dashed accent lines).
   - **Player labels + current score** next to each track; highlight the leader and flag any player
     who has reached 121 (game over) — display only, no state changes.
   - Each player track is keyed by participation id and color-distinct.
   - Graceful: empty rounds (fresh game) → all pegs at start; missing `playCount`/data → treat as 0.
3. **Mount it in GamePage.** In the in-progress (ACTIVE) view, call `getBoardComponent(game.moduleKey
   base id)` — note `moduleKey` may be versioned (`cribbage@1`); strip `@version` to match the module
   `id` the same way the rest of the app does. If a board component exists, render it **above** the
   existing numeric standings/totals — keep the standard per-hand **numeric entry and the totals
   table intact** (the board augments, it does not replace input). For non-cribbage modules nothing
   changes (registry returns null).
4. Keep GamePage's loading state, `AppShell` wrapper, headings, and the rank_order / winner_pick
   branches untouched.

## Conventions to honor

- TypeScript; reuse existing helpers, the participations/ScoreState data flow, and UI primitives. No
  backend changes, no scoring changes, no new dependencies.
- Type-only imports from `@game-ledger/contract` must use `import type` (see
  `prompts/startnewsession.md` gotchas — Vitest won't catch a bad value-import; it white-screens the
  live app).

## Tests (definition of done)

- Add `frontend/src/play/CribbageBoard.test.tsx` (or extend `play.test.tsx`):
  - Renders one track per participation (2 and 3 players) for a cribbage game.
  - Front/rear peg positions reflect `totals` and last-hand delta (assert via peg `data-testid` +
    position attribute/style for a known totals/rounds fixture — e.g. total 24 with a last hand of 8
    → rear at 16, front at 24).
  - **Skunk lines at 91 and 61 and the 121 finish are rendered.**
  - A player at ≥121 is flagged as the winner/game-over (display only).
  - Registry: `getBoardComponent('cribbage')` returns a component; `getBoardComponent('skyjo')`
    returns `null`; GamePage renders the board for a cribbage game and **not** for a numeric
    non-cribbage game (the numeric entry + totals table still render for cribbage).
- `pnpm test` (frontend Vitest) passes; `tsc --noEmit` clean. Run whatever the pre-commit/build runs.

## When done

1. Update frontmatter (`status: done`, `completed: 2026-06-27`, `result`); `git mv` to `prompts/done/`.
2. Update `prompts/startnewsession.md` (Current state / Last session: cribbage module + first
   per-game visual via the new presentation registry) and `docs/decisions.md` (the presentation-hook
   approach: `getBoardComponent(moduleId)` registry keyed by base module id; board is display-only;
   two-peg leapfrog derived from `totals` + last-round delta; skunk lines 91/61, finish 121).
3. **One commit on `dev`** (`feat:`, no AI mention), specific paths only, no push. Report hash /
   files / message, and any follow-ups (e.g. tap-the-board-to-peg as a future input mode; whether the
   presentation registry is ready for the next game's visual).
4. **Note for the orchestrator:** the dispatching session will verify this in the live browser over
   the FQDN (not just on green tests), so call out anything that needs a running stack to see
   (board only appears for a cribbage game with the module loaded after a backend restart).
