---
name: 42-released-prerelease-picker
status: done
created: 2026-06-28
model: sonnet
completed: 2026-06-28
result: All changes implemented and tested. Enum renamed pre_release/released, default flips to pre-release, picker filtered with toggle, empty-state hint, Pre-release badge. 270 backend / 159 frontend / 20 e2e all pass.
---

# Task: Picker shows released games by default; "Show pre-release games" toggle reveals the rest

Reframe the module maturity model (prompt 38) so the Start-New-Game picker defaults to **released**
games only, with a **"Show pre-release games"** toggle for ones still in development. Right now **no
game is released**, so the default list is empty until games are promoted — that's intended.

## Decisions (locked with the user)

- **Default flips to pre-release.** A module is "released" **only if explicitly marked**; missing
  maturity ⇒ **pre-release**. So all current games become pre-release and the default picker list is
  **empty** until games are promoted. (This is the opposite of prompt 38's "missing = complete".)
- **Rename the enum values** to match the language: `maturity: released | pre_release` (was
  `complete | in_dev`). Keep the field name `maturity`.
- **Toggle** "Show pre-release games" defaults **off**; when on, pre-release games appear with a
  `· Pre-release` marker in the option label.
- **Badge** on the game page becomes **"Pre-release"** (was "In Dev"), shown when a game is not released.
- **No game is marked `released`** in this change (none are promoted yet).

## Before you start

- Read `CLAUDE.md`. Read `frontend/src/play/StartGamePage.tsx` (the `<select id="game-select">`,
  `sortedModules`, and the `· In Dev` marker added in prompt 38), `frontend/src/play/GamePage.tsx`
  (the "In Dev" `Badge` near the title), `frontend/src/api/play.ts` (`ModuleInfo.maturity`),
  `packages/contract/src/module.schema.json` (the `maturity` enum), and `e2e/helpers.ts`
  (`startGameViaUi`).
- Recent commits: maturity `1989c78`, cribbage live pegging `f40e2cc`.

## Working tree check

`git status --porcelain` should show only this prompt file (exempt). Surface other dirty files.

## Codebase facts (researched — trust these)

- `module.schema.json` has `maturity` as `enum: ["in_dev","complete"]` → change to
  `["released","pre_release"]`. The contract compiles to `dist/` and the backend imports it — **rebuild
  the contract** after editing.
- `modules/cribbage/module.yaml` currently has `maturity: in_dev`. Since default = pre-release and
  nothing is released, **remove that line** (cribbage stays pre-release by default) — or set
  `maturity: pre_release` explicitly. Do not mark any game `released`.
- `ModuleInfo.maturity` (`frontend/src/api/play.ts`) → `'released' | 'pre_release'`. Add a helper sense
  of **released = `maturity === 'released'`** (missing ⇒ pre-release).
- Backend passes `maturity` through `GET /api/modules` automatically (`ModuleDefinition[key]: unknown`),
  no backend code change beyond the YAML/schema rebuild.
- `StartGamePage` builds `sortedModules` and renders `<option>`s; prompt 38 appended `· In Dev`. You'll
  filter + re-mark here.
- **prompt-38 tests to update:** `backend/src/module-loader/module-loader.cribbage.spec.ts` asserts
  cribbage `maturity === 'in_dev'`; `frontend/src/play/play.test.tsx` asserts the `· In Dev` picker
  marker; `frontend/src/play/CribbageBoard.test.tsx` asserts the "In Dev" badge. Update all for the new
  values/labels/behavior.

## What to do

1. **Schema + data:** rename the enum to `released | pre_release`, rebuild the contract; remove (or set
   `pre_release` on) cribbage's `maturity`.
2. **Type:** `ModuleInfo.maturity?: 'released' | 'pre_release'`; treat missing as pre-release.
3. **Picker (`StartGamePage`):**
   - Add a **"Show pre-release games"** checkbox/toggle near the game select, default **off** (persist
     the choice in `localStorage` so it sticks across visits).
   - **Default:** the `<option>` list includes only **released** games. When the toggle is on, also
     include pre-release games, each labelled with a trailing `· Pre-release`.
   - **Empty state:** when the (released-only) list is empty and the toggle is off, show a clear hint
     (e.g. "No released games yet — turn on *Show pre-release games* to see games in development.") so
     the user isn't staring at an empty dropdown. Keep sort = play-count desc then alpha within the
     shown set.
4. **Badge (`GamePage`):** render a **"Pre-release"** pill (reuse the existing Badge) when the game is
   not released; nothing when released.

## Conventions to honor

- TypeScript; additive/backward-compatible reads (missing maturity = pre-release). Type-only
  `@game-ledger/contract` imports use `import type`. No backend code change beyond YAML + schema rebuild.

## Tests (definition of done)

- Backend: update the module-loader spec — cribbage is pre-release (no `released` marker); schema
  validates all modules with the new enum.
- Frontend (Vitest): default picker excludes pre-release games (stub a mix of released + pre-release
  and a released one to prove inclusion); toggling "Show pre-release games" reveals them with the
  `· Pre-release` marker; the empty-state hint shows when no released games and toggle off; GamePage
  shows the "Pre-release" pill for a pre-release game and none for a released game. Update the flipped
  prompt-38 assertions.
- **E2E:** every game is now pre-release, so **update `startGameViaUi` in `e2e/helpers.ts`** to turn on
  "Show pre-release games" before selecting the module — otherwise no game is selectable and the whole
  suite breaks. Build backend+frontend and run the **full** suite green
  (`E2E_DATABASE_URL=…55432… pnpm test:e2e`, isolated DB per `startnewsession.md`).
- `pnpm test` (backend+frontend) + `tsc --noEmit` clean.

## When done

1. Frontmatter (`status: done`, `completed: 2026-06-28`, `result`); `git mv` to `prompts/done/`.
2. `docs/decisions.md` (newest at top): default = pre-release; `released` is opt-in (none yet); enum
   renamed `released | pre_release`; picker default = released-only + "Show pre-release games" toggle
   (localStorage-persisted) with `· Pre-release` marker + empty-state; badge "Pre-release".
3. Update `prompts/startnewsession.md` (Current state / Last session).
4. **One commit on `dev`** (`feat:`, no AI mention), specific paths only, no push. Report hash / files /
   message / full-e2e pass count. Note for the orchestrator: I'll verify live (default picker empty +
   toggle reveals pre-release games with the marker; "Pre-release" badge on the game page).
