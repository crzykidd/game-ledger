---
name: 39-cribbage-capture
status: done
created: 2026-06-28
model: sonnet
completed: 2026-06-28
result: >
  Capture registry (frontend/src/play/capture/) with CribbageCapture component: per-player
  +1/+2 quick buttons, numeric add field, per-player undo, rotating dealer/crib marker, Save Hand.
  GamePage routes cribbage to CribbageCapture via getCaptureComponent(). Generic ScoreForm
  blank→0 QoL. e2e rewritten to drive new UI and assert dealer rotation + peg advance + winner
  flag. 270 backend / 118 frontend / 20 e2e all pass. tsc --noEmit clean.
---

# Task: Cribbage hand capture — pegging buttons, rotating dealer/crib, per-player undo

Replace the generic numeric round form **for cribbage only** with a hand-oriented capture surface
that matches how cribbage is actually scored: per-player **quick-add pegging buttons** (+1, +2) plus
a numeric "add" for runs and the show counts, a live **"this hand"** total per player, **per-player
undo**, and a **rotating dealer/crib** marker. Buffered model — taps build each player's hand total,
**Save Hand** commits it as the existing `round_score` event. Cribbage stays `numeric_rounds`
(high/sum) and keeps the board (prompt 36); this changes only the **capture** (input) surface. This
is a large, in-dev (Beta) feature — cribbage is marked `maturity: in_dev` in prompt 38.

## Before you start

- Read `CLAUDE.md` (conventions, **no AI mention**, one prompt = one commit on `dev`). Skim
  `docs/module-contract.md` (capture/3-tier UI) and `docs/spec.md` write-model section.
- **Confirm prompt 38 landed** (cribbage has `maturity: in_dev`; `ModuleInfo.maturity` exists) — it
  should be committed before this runs. Check `prompts/done/`.
- Read `frontend/src/play/GamePage.tsx` end to end — how it branches capture by
  `moduleInfo.scoringType.id` (rank_order / winner_pick / numeric default), the numeric `ScoreForm`
  (~lines 460–540), the save-round handler (posts a `round_score` event `{ round, scores }`), and the
  **undo-last-round** control. Read `frontend/src/play/presentation/index.ts` +
  `CribbageBoard.tsx` — you are building the **capture** analogue of that presentation registry.

## Working tree check

`git status --porcelain` should show only this prompt file (exempt). Surface any other dirty files.

## Design — buffered hand model (no new scoring type, no new event type, no schema change)

- **A "round" = one hand.** Each player's hand total = pegging + the show (+ crib for the dealer).
  The capture UI assembles that number via buttons; **Save Hand** posts the SAME `round_score` event
  the generic form already posts (`{ round: currentRound, scores: { [participationId]: handTotal } }`),
  one number per player. Untouched players save **0**. The board + `numeric_rounds` resolve unchanged.
- **Dealer / crib = pure derivation, zero persistence.** Dealer of hand `N` (1-based) = the
  participant at **seat index `((N-1) mod playerCount)`**; `currentRound` / `N` comes from the
  ScoreState rounds count the board already reads. **Crib owner = the dealer.** It auto-advances when
  a hand is saved. The start-game seat order already lets the user pick who deals first (seat 1 deals
  hand 1) — no override UI in v1 (note it as a future enhancement).
- **Undo.** Pre-save, per-player undo just pops the last increment from client state (no event). After
  Save Hand, reuse the existing **undo-last-round** path (one hand = one round) for "undo last hand".
- **Buffered caveat:** in-progress (unsaved) pegging is client state and is lost on a mid-hand reload.
  Acceptable for v1 (single scorekeeper); note it for a possible future per-peg-persistence pass.

## What to do

1. **Capture registry** (mirror the presentation registry). Create `frontend/src/play/capture/` with
   `index.ts` exporting `getCaptureComponent(moduleId): React.ComponentType<CaptureProps> | null`
   (returns the cribbage capture for `'cribbage'`, else `null`) and a small generic `CaptureProps`
   contract (participations, current round, a `saveHand(scores)` callback that wraps GamePage's
   existing round-save, and the undo callback). Keep it generic so future games can register.
2. **CribbageCapture component** (`frontend/src/play/capture/CribbageCapture.tsx`):
   - Per player: a panel showing the player name, a **dealer chip + "crib" badge** on the current
     dealer, a live **"This hand: N"** total, **+1** and **+2** quick buttons, a small numeric
     **add** field (`+`) for runs / show counts (e.g. type `12` → add 12), and an **undo** (↶) that
     removes that player's last increment.
   - A **Save Hand** button: posts `{ round, scores }` (each player's accumulated hand total, 0 if
     untouched) via the callback, then resets the panels for the next hand (dealer advances by
     derivation). Disable double-submit.
   - Show whose crib the hand is (`"<dealer>'s crib"`). Match app Tailwind conventions (slate/indigo,
     `dark:` pairs); reuse `Button` and any Badge/pill from `components/ui/`.
3. **Mount in GamePage.** For cribbage (strip `@version` from `game.moduleKey` like the board does),
   render `getCaptureComponent(...)` **instead of** the generic numeric `ScoreForm`; keep the
   `CribbageBoard` above it and the totals/undo controls. All other modules: generic form unchanged
   (registry returns null).
4. **Generic round-entry QoL — blank → 0.** In the generic numeric `ScoreForm` save path, coerce an
   **empty** input to `0` on Save (and show the 0 rather than submitting silently), so a player who
   scored nothing that round saves 0. App-wide (raised in the cribbage round-rework context); benefits
   every numeric game. Keep it a clearly separate, small change.

## Conventions to honor

- TypeScript; reuse the existing round-save + undo flow and `numeric_rounds` resolution — **no backend
  changes, no new event/scoring type, no schema/migration.** If you find you *need* backend changes,
  STOP and report rather than expanding scope.
- Type-only imports from `@game-ledger/contract` use `import type` (white-screen gotcha).

## Tests (definition of done)

- **Unit (Vitest):**
  - Dealer rotation: hand 1 → seat 0, hand 2 → seat 1, wraps at `playerCount`; crib owner = dealer.
  - Capture accumulation: +1/+2/add sum into the per-player hand total; per-player undo pops the last
    increment only.
  - Save Hand posts `round_score` with each player's total and **0 for untouched** players.
  - Registry: `getCaptureComponent('cribbage')` returns a component, `('skyjo')` returns null; GamePage
    renders the cribbage capture for a cribbage game and the generic `ScoreForm` for a numeric
    non-cribbage game.
  - blank→0: generic `ScoreForm` submits 0 for an empty input.
- **E2E:** update `e2e/g-cribbage-happy-path.e2e.ts` — it currently types into
  `input[aria-label="Round score for X"]`, which no longer exists for cribbage. Drive the **buttons/
  add field + Save Hand** instead; assert the board pegs advance, the **dealer chip moves** between
  hands, and a player crossing 121 gets the winner flag. Then run the **full** suite green
  (`E2E_DATABASE_URL=…55432… pnpm test:e2e`, build backend+frontend first) — don't weaken assertions.
- `pnpm test` (backend+frontend) + `tsc --noEmit` clean.

## When done

1. Update frontmatter (`status: done`, `completed: 2026-06-28`, `result`); `git mv` to `prompts/done/`.
2. `docs/decisions.md` (newest at top): the buffered hand-capture model (round=hand, Save Hand →
   `round_score`), the zero-persistence dealer/crib derivation (seat `((N-1) mod count)`), the capture
   registry mirroring the presentation registry, and blank→0 in the generic form.
3. Update `prompts/startnewsession.md` (Current state / Last session) for the cribbage capture + capture
   registry + blank→0.
4. **One commit on `dev`** (`feat:`, no AI mention), specific paths only, no push. Report hash / files /
   message, full e2e pass count, and any follow-ups (e.g. dealer override UI, per-peg persistence,
   live multi-device). **Note for the orchestrator:** the dispatching session will verify this live in
   the browser (drive the pegging buttons, watch the dealer rotate + pegs move), so call out anything
   needing a running stack.
