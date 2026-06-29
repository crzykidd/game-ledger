---
name: 17-fix-multigame-bugs
status: done
created: 2026-06-25
model: sonnet
completed: 2026-06-25
result: "All 5 bugs fixed. Uno root cause: ScoreForm had no key prop so state didn't reset between rounds (allFilled true against stale entries) -> fixed with key={currentRound}. Dashboard/History now fetch /api/modules for real game names (one source of truth). SkyjoReference removed from History; GamePage uses generic ModuleReference driven by YAML info.scoring. Bug 5 President: made rank-only by removing pointsMap from president module.yaml so no Score column. Also fixed Skyjo e2e (default module was five-crowns, now selects Skyjo explicitly) and InstallWizard auth (used raw api login, never set AuthContext user -> wizard bounced to /login; now uses useAuth().login). Multi-game e2e plays all four games: Uno (save 2 rounds + form-reset-empty assertion, high-wins), Five Crowns (low-wins, round reset), President (drag finish order, rank-only no Score column), Skyjo (existing). Plus Dashboard/History show real name not Skyjo and no Skyjo reference for non-Skyjo. Green: lint, build, 124 backend + 56 frontend unit tests, 9/9 e2e."
---

# Task: Fix hardcoded-Skyjo bugs + Uno save-round, and add multi-game regression tests

The play UI has Skyjo-specific assumptions that break other games, and the test suite only
ever exercised Skyjo end-to-end (which is why these shipped). **Reproduce each bug, fix it, and
add tests that PLAY Uno / Five Crowns / President — not just Skyjo.**

## Confirmed / reported bugs

1. **Dashboard active games are hardcoded "Skyjo".** `frontend/src/routes/Dashboard.tsx:172`
   renders `<span ...>Skyjo</span>` for every active game. Must show each game's real module name.
2. **History labels incomplete.** `frontend/src/play/HistoryPage.tsx:16`
   `labels = { skyjo: 'Skyjo' }` — non-Skyjo games show the raw key. Must show real module names.
3. **Skyjo reference shown for all games.** `GamePage.tsx:676` and `HistoryPage.tsx:110` render
   `<SkyjoReference>` unconditionally — President/Uno/Five Crowns show "Skyjo Quick Reference".
   Use the module's OWN reference (`info.scoring`) or hide when none; remove the hardcoded
   SkyjoReference usage.
4. **Save Round does not work in Uno (user-reported).** Reproduce in a browser, find the real
   root cause (check the GET /api/modules response for Uno — does it include the capture `fields`
   and `scoringType.config`? check the event POST request/response; check `hasEndedRound` /
   `allFilled` / the module YAML capture fields), and fix it. Do NOT guess — reproduce first.
5. **Re-verify President finish-order** submit + results are correct (rank-only).

The display name should come from the loaded module metadata (the GET /api/modules list already
used by GamePage/StartGamePage), not a hardcoded map. Fetch it where needed (dashboard, history)
or include the module name in the game summary API — your call, but make ONE source of truth.

## Before you start

- Read `CLAUDE.md`. The dev stack may be running on 8088 (the user's instance — do NOT disrupt
  their data). For your own testing, use the **e2e Playwright harness** (isolated test DB +
  wizard) and/or a throwaway compose project — don't depend on the user's login.

## Working tree check

`git status --porcelain` should show only `prompts/17-fix-multigame-bugs.md`. Otherwise list/ask.

## What to do

- Fix bugs 1–5 above. One source of truth for the per-game display name + reference.
- **Reproduce Uno save-round in a browser/e2e before fixing**; verify the fix by saving multiple
  rounds in Uno and finishing to a (high-wins) result.

## Tests (definition of done) — THIS is the core deliverable

- **Extend the e2e suite (`e2e/`) to play ALL FOUR games end-to-end**, not just Skyjo:
  - **Uno**: start → **save ≥2 rounds** (the regression) → finish → results ordered **high-wins**.
  - **Five Crowns**: start → save a couple rounds → results **low-wins**.
  - **President**: start → drag a finish order → finish → **rank-only** results (no Score column).
  - Skyjo: keep the existing happy path.
- **Assert the display-name bug can't recur**: an e2e (or component test) that a non-Skyjo active
  game shows its real name on the Dashboard and in History (NOT "Skyjo"), and that a non-Skyjo
  game does not show the Skyjo reference.
- `pnpm lint` / `pnpm build` / full `pnpm test` (backend + frontend) green and stable; the new
  e2e specs pass against the isolated harness. Capture screenshots of each game's score entry +
  results as evidence. Tear down any stack you start; don't touch the user's running data.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-25`/`result`).
2. `git mv prompts/17-fix-multigame-bugs.md prompts/done/`.
3. Log root causes (esp. the Uno one) + fixes in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`fix: per-game names/reference + Uno save-round, multi-game e2e`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, the **actual Uno root cause** with evidence, what fixed
   each of 1–5, and the e2e coverage you added (which games, which assertions).
