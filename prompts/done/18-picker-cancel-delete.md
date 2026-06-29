---
name: 18-picker-cancel-delete
status: done
created: 2026-06-25
model: sonnet
completed: 2026-06-25
result: All three changes implemented and tested. Clickable module picker cards (no default selection, Start disabled until module+players chosen). POST /api/games/:id/cancel (creator-only, sets ABANDONED). DELETE /api/games/:id (creator-only, FK-safe cascade). Frontend cancel/delete on GamePage and HistoryPage (creator-only). 128 backend tests, 60 frontend tests, 12 e2e tests all green.
---

# Task: Fix the game picker + add Cancel game and Delete game (creator-only)

Three related changes to the game lifecycle UX. The person who STARTED the game is the only one
who can cancel or delete it.

## Before you start

- Read `CLAUDE.md`. The app is at commit `585150f`. Multi-game works (Skyjo/Uno/Five
  Crowns/President). `Game.createdById` is the starter's user id; `GameStatus` enum already has
  `ACTIVE | COMPLETE | ABANDONED`. Reuse the auth/RBAC surface + the polished design system.
- Do NOT touch the user's live data. For testing use an ISOLATED postgres (e.g.
  `docker run -d --name gl-test-db -e POSTGRES_USER=gameledger -e POSTGRES_PASSWORD=gameledger -e POSTGRES_DB=gameledger_test -p 55432:5432 postgres:16-alpine`, and `E2E_DATABASE_URL=postgresql://gameledger:gameledger@localhost:55432/gameledger_test` for e2e). Never `down -v` the `game-ledger` project. Clean up your test containers.

## Working tree check

`git status --porcelain` should show only `prompts/18-picker-cancel-delete.md`. Otherwise list/ask.

## What to do

**1. Fix the start-game module picker (`StartGamePage.tsx`).**
- Today it auto-selects the first module returned (Five Crowns), and picking another is finicky
  — users start the wrong game by accident.
- Make each module a **clearly clickable option** (clicking anywhere on the option/card selects
  it, not just a small radio), with the selected one visibly highlighted.
- **Default to NO module selected**; the "Start game" button stays disabled until a module AND a
  valid participant count are chosen. Show each module's player range.

**2. Cancel game (creator-only) — abandon an in-progress game.**
- Backend: `POST /api/games/:id/cancel` → if the caller is the game's creator
  (`game.createdById === currentUser.id`) and status is `ACTIVE`, set status `ABANDONED` +
  `endedAt`. 403 otherwise. (Keep the record; it's not a delete.)
- Frontend: a **"Cancel game"** action on the active GamePage, visible only to the creator, with
  a confirm ("Cancel this game? Scores will be kept but the game ends."). After cancel, navigate
  to the dashboard. Abandoned games show as **Abandoned** (not Active) in History/Dashboard.

**3. Delete game (creator-only) — remove the game entirely.**
- Backend: `DELETE /api/games/:id` → if the caller is the creator, hard-delete the game and its
  `game_events`, `score_states`, `game_results`, `participations` (FK-safe order / transaction).
  403 otherwise.
- Frontend: a **"Delete"** action on each game in History (and on the GamePage), visible only to
  the creator, with a confirm ("Delete this game permanently? This can't be undone."). Remove it
  from the list on success.

Permission rule for both: **only `game.createdById`** (the starter). Enforce server-side
(don't rely on the UI hiding it). Note in `docs/decisions.md` that admins are NOT granted this
yet (could be added later via a permission).

## Tests (definition of done)

- Backend tests: cancel sets ABANDONED for the creator and 403s for a non-creator; delete removes
  the game + children for the creator and 403s for a non-creator.
- **Extend the e2e suite** (isolated DB): pick a specific (non-default) module and start it
  (proves the picker fix), **cancel** an active game (→ shows Abandoned), and **delete** a game
  (→ gone from History). A non-creator cannot cancel/delete (component/integration level is fine).
- `pnpm lint` / `pnpm build` / full `pnpm test` (backend+frontend) + e2e all green. Capture
  screenshots of the new picker + the cancel/delete confirms.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-25`/`result`).
2. `git mv prompts/18-picker-cancel-delete.md prompts/done/`.
3. Log choices (picker pattern, cancel-vs-delete semantics, creator-only rule) in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`feat: clickable game picker + cancel/delete game (creator-only)`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, the picker change, the cancel/delete endpoints +
   permission enforcement, and the e2e coverage added.
