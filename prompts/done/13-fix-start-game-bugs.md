---
name: 13-fix-start-game-bugs
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: Fixed: modules mount (docker-compose.dev.yml + Dockerfile), self-Player creation on user creation + backfill, reorderable seat order UI with up/down buttons.
---

# Task: Fix the three start-a-game bugs (Gitea issues #1, #2, #3)

Close three reported bugs in the start-a-game flow. Verify each by actually starting a Skyjo
game through the running stack in a browser.

## Gitea issues (diagnosed root causes below)

- **#3 — Skyjo won't start, "module not loaded".** The module loader resolves the modules dir at
  `path.resolve(__dirname, '../../../modules')` → `/app/modules` in the container, but **`modules/`
  is never copied into the image nor mounted in dev**, so 0 modules load.
- **#1 — can't select myself when starting a game.** Users get **no self-`Player`** (the install
  wizard / accounts create a `User` but no `Player`); the participant picker selects by
  `Player.id`, so the current user can't be added.
- **#2 — can't change player seat order.** Seat order currently follows checkbox-selection order;
  needs an explicit reorderable list (drag-to-reorder preferred, up/down controls acceptable).

## Before you start

- Read `CLAUDE.md`. Bring up the dev stack on FREE ports if needed
  (`DEV_APP_PORT=... docker compose -f docker-compose.dev.yml up --build -d`) — say which you used.
  Docker + Playwright available.

## Working tree check

`git status --porcelain` should show only `prompts/13-fix-start-game-bugs.md`. Otherwise list and ask.

## What to do

**#3 — make modules available in the container:**
- **Dev:** mount the repo `modules/` into the backend service in `docker-compose.dev.yml`
  (e.g. `./modules:/app/modules`) so it's present and live-editable.
- **Prod:** `COPY modules ./modules` into `backend/Dockerfile` (final/runtime stage, at `/app/modules`).
- Optionally make the path overridable via a `MODULES_DIR` env (default the current resolution),
  but the key fix is the dir actually existing in the container.
- **Verify Skyjo registers on boot** (loader logs "Loaded 1 game module(s)"; `GET /api/games`
  start flow lists Skyjo / starting a Skyjo game succeeds).

**#1 — give every user a self-`Player`:**
- Create a linked `Player` (`userId = user.id`, `nickname = user.nickname`,
  `createdById = user.id`) whenever a `User` is created — the install wizard (first SUPER_ADMIN)
  and any other user-creation path. (Invite-accept already links a guest Player; make sure the
  user ends up with exactly one self-Player, no duplicates.)
- **Backfill** existing users that lack a self-Player (a startup reconcile or a migration) — the
  already-created super admin must get one.
- Ensure `GET /api/players` returns the caller's self-Player so the start-game picker can show
  and pre-select **"you"**.

**#2 — reorderable seat order (frontend StartGamePage):**
- Selecting participants and ordering them are now separate: after selecting players, present an
  **ordered list** the user can **reorder (drag-and-drop preferred; up/down arrow buttons as an
  accessible fallback)**. The seat order sent to `POST /api/games` (`participantPlayerIds`)
  reflects the arranged order, not checkbox order. Make it pleasant for 4+ players on mobile.

## Conventions to honor

- Reuse existing patterns/components. Backend changes minimal + tested; frontend reuses the
  design system. `pnpm lint/build/test` must pass; any migration applies cleanly.

## Tests (definition of done)

- **#3:** a test/asserted check that the loader loads Skyjo when `modules/` is present, and a
  **browser/Playwright check that a Skyjo game actually starts** through the ingress.
- **#1:** the caller's self-Player exists and appears in `GET /api/players`; a unit test for
  self-Player creation on user creation + backfill (no duplicates).
- **#2:** a frontend test that reordering changes the `participantPlayerIds` order sent to the API.
- Existing suites stay green.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/13-fix-start-game-bugs.md prompts/done/`.
3. Log non-obvious choices (self-Player strategy/backfill, modules mount/copy, reorder UX) in
   `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`fix: start-a-game — load modules in container, self-player,
   seat reorder`), clean message, **no AI mention**. Stage specific paths, don't push. Commit
   before finishing.
5. **Report back**: commit hash + message, what fixed each of #1/#2/#3 (with the browser
   verification that a Skyjo game now starts), and confirm which Gitea issues are resolved (do
   NOT close them yourself — the orchestrator will close them after review).
