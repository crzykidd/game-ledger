---
name: 40-cribbage-capture-polish
status: done
created: 2026-06-28
model: sonnet
completed: 2026-06-28
result: >
  +3 button added. Add field switched to type=text/inputMode=numeric (no spin arrows, numeric
  keypad on mobile). Running Totals hidden for games with a board (getBoardComponent non-null).
  CribbageBoard.test.tsx:382 flipped; new CribbageCapture.test.tsx (11 tests). All pass:
  270 backend / 130 frontend / 20 e2e.
---

# Task: Cribbage capture polish — +3 button, mobile-friendly add control, drop duplicate totals

Three UX fixes on the cribbage hand-capture (prompt 39) from live feedback:
1. Add a **+3** quick button (currently only +1/+2).
2. The numeric "add" field relies on the browser's **native number-input spin arrows** — they're tiny
   on desktop and **absent on mobile** (this app is mobile-first). Stop depending on them.
3. The **"Running Totals"** table is redundant for cribbage — the **board already shows each player's
   score**. Hide it for cribbage (any game that has a board).

## Before you start

- Read `CLAUDE.md` (conventions, **no AI mention**, one prompt = one commit on `dev`).
- Read `frontend/src/play/capture/CribbageCapture.tsx` (the capture component) and
  `frontend/src/play/GamePage.tsx` (where Running Totals renders).
- Recent commits: cribbage capture `8b22572`, maturity `1989c78`.

## Working tree check

`git status --porcelain` should show only this prompt file (exempt). Surface any other dirty files.

## Codebase facts (researched — trust these)

- **Quick buttons + add field** live in `CribbageCapture.tsx`: `+1` (`btn-plus1-<id>` /
  `aria-label="+1 for <name>"`) and `+2` (`btn-plus2-<id>`), then a numeric add field
  (`add-input-<id>` / `aria-label="Add points for <name>"`, currently `type="number"` with
  `appearance-none`) and an **Add** button (`add-btn-<id>` / `aria-label="Add custom points for
  <name>"`). `addIncrement(id, n)` pushes onto the per-player increment stack.
- **Running Totals** renders in `GamePage.tsx` at line ~1054 (`<h…>Running Totals</h…>` + `<TotalsTable
  … />` at ~1056). **rank_order games already hide it** — find that conditional and extend it. The
  board registry is already imported: `getBoardComponent` from `./presentation`. `game.moduleKey` may
  be versioned (`cribbage@1`) — strip `@version` like the board/capture mounting does.
- **Existing test to FLIP:** `frontend/src/play/CribbageBoard.test.tsx:~382` currently asserts
  "Running Totals table should still render" for cribbage — change it to assert it is **NOT** rendered
  for cribbage. The numeric-non-board precedent (`play.test.tsx:~1278`, rank_order hides it) is your
  pattern for the new assertion.
- **E2E:** `e2e/g-cribbage-happy-path.e2e.ts` drives the add control by **aria-label**
  (`Add points for <name>` + `Add custom points for <name>`) — **keep those aria-labels stable** so it
  keeps working. It does not assert on the cribbage totals-table (other games' specs do, but they have
  no board, so they're unaffected).

## What to do

1. **+3 button.** Add a `+3` quick button next to `+2` in `CribbageCapture` (`addIncrement(id, 3)`),
   matching the +1/+2 styling and the testid/aria-label convention (`btn-plus3-<id>` /
   `aria-label="+3 for <name>"`). Touch target ≥44px.
2. **Mobile-first add control.** Rework the numeric add field so it does **not** depend on native
   number spinners (the +1/+2/+3 buttons are the steppers; the field is for arbitrary amounts like
   show counts):
   - Fully suppress native spin buttons cross-browser (WebKit `::-webkit-inner-spin-button` /
     `::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0 }` and Firefox
     `appearance: textfield` / `-moz-appearance: textfield`). Add the rule wherever global/utility CSS
     lives if a className alone can't target the pseudo-elements.
   - Ensure the **mobile numeric keypad** shows: `inputMode="numeric"` (keep it usable for typing a
     value like `24`). You may keep `type="number"` or switch to `type="text"` + `inputMode="numeric"`
     + `pattern="[0-9]*"` — whichever reliably hides spinners and shows the numeric keypad.
   - Keep the **Add** button explicit and ≥44px, and **keep the existing aria-labels** unchanged.
   - Make the field comfortably tappable (sane width/height) — the point is it reads as a clean typed
     box with no tiny arrows.
3. **Hide Running Totals for cribbage.** Extend the Running-Totals render condition in `GamePage` so
   the section is **not** rendered when the module has a board (`getBoardComponent(baseModuleId)` is
   non-null) — the board is the standings view. Leave it intact for every game without a board.

## Conventions to honor

- TypeScript; reuse existing styling (`Button`, slate/indigo, `dark:` pairs, `cn`). No backend changes.
  Type-only `@game-ledger/contract` imports use `import type`.

## Tests (definition of done)

- Unit (Vitest):
  - `+3` adds 3 to the hand total; +1/+2/+3 and the add field accumulate together; undo still pops the
    last increment.
  - GamePage does **not** render "Running Totals"/`totals-table` for a cribbage game, but **does** for a
    numeric non-board game (e.g. skyjo/uno). **Update** the existing `CribbageBoard.test.tsx:~382`
    assertion accordingly.
- E2E: `e2e/g-cribbage-happy-path.e2e.ts` still green (add aria-labels unchanged). Build backend +
  frontend and run the **full** suite (`E2E_DATABASE_URL=…55432… pnpm test:e2e`) — isolated DB per
  `prompts/startnewsession.md`. Don't weaken assertions.
- `pnpm test` (backend+frontend) + `tsc --noEmit` clean.

## When done

1. Frontmatter (`status: done`, `completed: 2026-06-28`, `result`); `git mv` to `prompts/done/`.
2. `docs/decisions.md` (newest at top): +3 button; add-control no longer relies on native number
   spinners (mobile-first); Running Totals hidden for games with a board (board is the standings view).
3. Update `prompts/startnewsession.md` (Last session) for the cribbage capture polish.
4. **One commit on `dev`** (`feat:` or `fix:`, no AI mention), specific paths only, no push. Report
   hash / files / message / full-e2e pass count. **Note for the orchestrator:** I will verify live in
   the browser at desktop **and a narrow (mobile) viewport** — call out anything needing a running
   stack (e.g. the add field has no spin arrows and shows a numeric keypad on mobile).
