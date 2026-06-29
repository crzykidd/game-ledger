---
name: 41-cribbage-live-pegging
status: done
created: 2026-06-28
model: sonnet
completed: 2026-06-28
result: >
  Replaced buffered "Save Hand" cribbage capture with live pegging. Every +1/+2/+3 tap and
  typed-add POSTs a round_score event immediately; board peg animates in real time. "End Deal"
  posts empty-scores marker to rotate crib/dealer. Per-peg undo via existing undo-last-round
  endpoint. Mid-deal win detection: when any player reaches ≥121 the capture panel is replaced
  by a win banner with player name, Finish Game, and Undo. Rear-peg derivation fixed (scan per
  player's own last non-zero delta). CaptureProps interface redesigned; GamePage wired with
  handleAddScore/handleEndDeal/handleUndoLast. 157 frontend / 20 e2e unit tests all pass;
  TypeScript clean.
---

# Task: Cribbage live pegging — every score moves the peg now; "End Deal" rotates the crib; win on crossing 121

Replace the **buffered** cribbage capture (prompt 39/40: taps accumulate, "Save Hand" commits a hand
total) with a **live** model that matches a real cribbage board:

- **Every scoring action persists immediately and moves the board peg right then** — pegging (+1/+2/+3),
  his heels/nobs, your hand count, the crib owner's crib count (the numeric add field). No buffering.
- **Undo walks back peg-by-peg** (each peg is its own committed score; undo pops the most recent one).
- The bottom button is **"End Deal"** — it only **rotates the dealer/crib** to the next player and
  starts the next deal. It commits no score (scores are already live). Persisted so rotation survives
  reload.
- **The game ends when a player crosses 121 — mid-deal, not at a deal boundary.** The instant a peg
  pushes a total to ≥ target, surface a prominent win + **Finish Game** prompt. You never End Deal to win.

**This is frontend-only — no backend changes.** If you believe you need a backend/schema/DTO change,
STOP and report rather than making one.

## Before you start

- Read `CLAUDE.md` (conventions, **no AI mention**, one prompt = one commit on `dev`).
- Read the current `frontend/src/play/capture/CribbageCapture.tsx` (buffered), its `CaptureProps` in
  `frontend/src/play/capture/index.ts`, `frontend/src/play/GamePage.tsx` (round-save + undo handlers,
  the `currentRound` header, where capture/board mount), and `frontend/src/play/presentation/
  CribbageBoard.tsx` (peg derivation).
- This **supersedes** the buffered model from commits `8b22572` / `fc4abec`. Keep the +1/+2/+3 buttons,
  the numeric add field (text + inputMode=numeric, from prompt 40), per-player layout, and the
  dealer/crib chip — only the *commit semantics* change (post-on-tap instead of buffer-then-save).

## Backend facts (researched — trust these; you do NOT change the backend)

- `POST /api/games/:id/events` (`PostEventDto`): `type` is `@IsString()` (NO whitelist) and `payload`
  is `@IsObject()`. So any event shape is accepted. `appendEvent` stores it and calls
  `updateScoreState(game, type)`, which **only materializes `round_score`** (and winner_pick/
  finish_order); any other type → no score change.
- `round_score` payload: `{ round: number, scores: Array<{ participationId, roundScore }> }`. The
  materializer **buckets events by `round` number** (same `round` merges/overwrites). Totals = sum of
  all round scores. So **each peg must use a UNIQUE, strictly-increasing `round` number** with a
  single scorer in `scores`.
- `POST /api/games/:id/undo-last-round` finds the **last `round_score` event** and deletes the events
  with that (max) `round` number, then re-materializes. With one peg per unique round, this **undoes
  exactly the last peg**. Reuse it as the per-peg undo.
- ScoreState per participation: `payload.rounds = Array<{ round, scores: Record<pid, number> }>` and
  `payload.totals`. An empty round (`scores: {}`) is materialized fine and **does not change totals**.

## Design (frontend-only) — how to model it

- **Each peg = a `round_score` event** with `round = (max existing round in ScoreState) + 1` and
  `scores: [{ participationId: <scorer>, roundScore: <points> }]`. Post it, await, let GamePage refresh
  ScoreState (it already does on event post) → the board peg moves immediately. Post **sequentially**
  (await each; disable the just-tapped control / guard against races so two taps can't grab the same
  round number). Optimistic UI is optional polish.
- **End Deal = a `round_score` event with empty `scores: []`** (a no-op marker round; does not change
  totals). The **current deal number = 1 + (count of rounds in ScoreState whose `scores` is empty)**.
  Crib owner / dealer of deal `D` = participant at **seat index `((D-1) mod playerCount)`** (same
  derivation as today, but driven by the deal-marker count, not the raw round count). This means undo
  of an End Deal marker cleanly un-ends the deal (uniform undo) — desirable.
- **Win on cross:** after each peg, if any `totals[pid] >= target`, show the win state. The board
  already flags the winner; GamePage must additionally surface a clear "**<name> wins → Finish
  Game**" banner and stop further pegging (Finish uses the existing `finishGame` flow). Do NOT
  auto-finish — let the scorekeeper confirm (so a mis-tap can be undone first).

## What to do

1. **Rework `CribbageCapture`** to live posting:
   - +1/+2/+3 and the add field each **immediately post a single-scorer `round_score`** (via a new
     prop callback, e.g. `addScore(participationId, points)`), awaited; the displayed total/peg comes
     from the refreshed ScoreState (no client-side "this hand" buffer).
   - Remove the buffered increment stack and the "This hand: N" buffer concept. The per-player display
     becomes the player's **live total** (and/or the last peg), sourced from ScoreState.
   - **Undo** per player/last peg calls the existing undo-last-round handler (one tap = undo one peg).
     (Per-player vs global "undo last peg" — global "Undo last peg" is fine since undo is by recency;
     keep it simple and correct.)
   - Bottom button **"End Deal"** → posts the empty-scores marker (via e.g. `endDeal()`), which rotates
     the crib (derivation updates from the new marker count). Remove "Save Hand".
   - Keep the dealer/crib chip + "<dealer>'s crib — Deal N" label, now driven by the deal count.
2. **Update `CaptureProps`** (`capture/index.ts`) for the live model: provide `addScore`, `endDeal`,
   `onUndoLast`, the current deal number (or the data to derive it), `saving`, and the participations
   with their ScoreState. Wire these in GamePage to its event-post / undo-last-round handlers.
3. **GamePage cribbage branch:**
   - Header shows **"Deal N"** (from the marker count), not "Round N" (raw rounds are pegs now).
   - When any total ≥ target, render the **win banner + Finish Game** and disable further scoring.
   - Route the capture's `addScore`/`endDeal`/`onUndoLast` to the existing event-post + undo endpoints.
4. **`CribbageBoard` rear-peg refinement:** compute each player's rear peg from **that player's own
   last non-zero increment** (scan their rounds backward for the last round where `scores[pid]` > 0),
   not the global last round — so the two-peg leapfrog gap reflects that player's last peg and is
   robust to interleaved pegs and empty deal-marker rounds. Front peg stays = `totals[pid]`.

## Conventions to honor

- TypeScript; reuse the existing event-post + undo-last-round flow. **No backend/scoring/schema
  changes.** Type-only `@game-ledger/contract` imports use `import type`.

## Tests (definition of done)

- Unit (Vitest):
  - `addScore` posts a `round_score` with a unique, increasing `round` and a single scorer; totals
    update from ScoreState (mock the post + refreshed state).
  - `endDeal` posts an empty-scores `round_score`; deal/crib derivation = `1 + emptyRoundCount`, crib
    owner rotates `((deal-1) mod N)`.
  - Win: when a player's total ≥ target, the win/Finish UI is shown and scoring is disabled.
  - Board: rear peg uses each player's own last non-zero increment (interleaved-pegs fixture).
  - Update/replace the prompt-39/40 buffered tests (`This hand` buffer, Save Hand) for the live model.
- E2E: **rewrite** `e2e/g-cribbage-happy-path.e2e.ts` for live play — tap pegs and assert the board
  peg / total updates **after each tap** (not just at the end); **undo** reverts one peg; **End Deal**
  rotates the crib chip; pushing a player to ≥121 **mid-deal** shows the win + Finish (no End Deal
  needed). Build backend+frontend, run the **full** suite green (`E2E_DATABASE_URL=…55432… pnpm
  test:e2e`, isolated DB per `startnewsession.md`). Don't weaken assertions.
- `pnpm test` (backend+frontend) + `tsc --noEmit` clean.

## When done

1. Frontmatter (`status: done`, `completed: 2026-06-28`, `result`); `git mv` to `prompts/done/`.
2. `docs/decisions.md` (newest at top): live pegging supersedes the buffered model; each peg = a
   unique-round `round_score` (live totals + per-peg undo via undo-last-round); End Deal = empty-scores
   marker, deal/crib derived from marker count; win detected on crossing target mid-deal (not at deal
   end); board rear-peg uses each player's own last increment. **No backend change** (event `type` is
   free-form; non-round_score is ignored by materialization).
3. Update `prompts/startnewsession.md` (Current state / Last session).
4. **One commit on `dev`** (`feat:`, no AI mention), specific paths only, no push. Report hash / files /
   message / full-e2e pass count. **Note for the orchestrator:** I'll verify live (tap pegs → pegs move
   immediately; undo per peg; End Deal rotates crib; cross 121 mid-deal → win), so flag anything needing
   a running stack.
