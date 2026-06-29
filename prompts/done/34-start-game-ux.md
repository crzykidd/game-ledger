---
name: 34-start-game-ux
status: done
created: 2026-06-27
model: sonnet
completed: 2026-06-27
result: feat: start-new-game UX — game dropdown, count buttons, seat-slot grid
---

# Task: Start-New-Game UX — game dropdown + dynamic player-slot grid

Rework `StartGamePage` per the agreed design: a sorted **game dropdown** (the long card list doesn't
scale as the library grows) and a **dynamic participant picker** — numbered count buttons for the
selected game's min–max, then a grid of player dropdowns (one per seat). Frontend half; depends on
prompt 33 (adds `playCount` to `/api/modules`).

## Before you start

- Read `CLAUDE.md`. Confirm prompt 33 landed (modules now include a per-user hosted `playCount` —
  check its report/`docs/decisions.md` for the exact field name; the rest of this prompt assumes
  `playCount`).
- Read the current `frontend/src/play/StartGamePage.tsx` end to end — you are rewriting its picker
  and participant sections, reusing its data loading, validation, and submit logic.

## Working tree check

`git status --porcelain` should be clean. List/ask about unexpected dirty files. This file is exempt.

## Codebase facts

- `StartGamePage` already loads `listPlayers()`, `listPlaygroups()`, `listModules()` and calls
  `createGame({ moduleKey, playgroupId?, participantPlayerIds })` (`frontend/src/api/play.ts`).
  Keep this data flow and the `createGame` contract (it takes an **ordered** `participantPlayerIds`
  array — order = seat order).
- `ModuleInfo` gains `playCount` (prompt 33). Update the `ModuleInfo` interface in
  `frontend/src/api/play.ts` to include `playCount: number`.
- UI primitives: `Button`, `Card` from `frontend/src/components/ui/`; `useToast`; `cn` from
  `components/ui/utils`. Match the app's Tailwind conventions (slate surfaces, indigo accent, paired
  `dark:` variants). The existing native `<select>` styling for the playgroup field in this file is a
  good template for the game/player dropdowns.
- Tests: Vitest + Testing Library; pattern in `frontend/src/play/*.test.tsx` (or `admin.test.tsx`) —
  `stubFetch` URL→JSON, `/api/auth/me` drives auth. Check for an existing StartGamePage test to
  extend; otherwise add one.

## What to do

Rewrite the form so it reads:

1. **Game dropdown** — replace the radiogroup of cards with a single `<select>` (styled like the
   existing playgroup select). **Sort options most-played-first, then alphabetical**:
   `modules.sort((a,b) => b.playCount - a.playCount || a.name.localeCompare(b.name))`. Show the
   player range in the option label is optional (e.g. `Skyjo (2–8)`); keep it readable. No default
   selection — first option is a `— Select a game —` placeholder.
2. **Player-count buttons** — once a game is selected, render numbered buttons for its
   `players.min`..`players.max` (inclusive). Selecting a count `N` sets the number of seat slots.
   Style as a row of small toggle buttons; the active count is highlighted (indigo, like the
   selected module card was). Changing the game resets the count/slots to match the new range.
3. **Player-slot grid** — render `N` dropdowns in a responsive grid (1 col mobile, 2 cols ≥sm), each
   labelled by seat (`Seat 1`, `Seat 2`, …). Each `<select>` lists the available roster
   (`availablePlayers`) and **excludes players already chosen in other slots** (a player can't be
   double-seated). Slot order = seat order → build `participantPlayerIds` from slot 1..N in order.
   - **Remove** the `@dnd-kit` drag-to-reorder seat list and its `SortablePlayerItem` (slot order
     now defines seats). You may drop the `@dnd-kit/*` imports from this file. Don't uninstall the
     packages (other code may use them — check; only remove imports here).
4. **Playgroup** — keep the playgroup `<select>`. Selecting a playgroup pre-fills: set `N` to the
   group's member count (clamped to the selected game's min–max) and fill the slots with its members
   in order. Clearing it empties the slots.
5. **Validation / submit** — Start is enabled only when a game is selected, a count is chosen, and
   **all N slots are filled with distinct players**. On submit, pass the ordered slot players to
   `createGame`. Keep the existing min/max guard and error toasts.

Keep the page's loading state, `AppShell` wrapper, heading, and overall card layout.

## Conventions to honor

- TypeScript; reuse existing helpers and the `createGame` contract. No new design-system pieces.
- Graceful if `playCount` is missing (treat as 0) so the page still works if hit before prompt 33.

## Tests (definition of done)

- Extend/add `frontend/src/play/StartGamePage.test.tsx` (Vitest + Testing Library; stub
  `/api/players`, `/api/playgroups`, `/api/modules`, `/api/auth/me`):
  - Game `<select>` options are ordered most-played-first then alphabetical (stub modules with
    differing `playCount`).
  - Selecting a game renders count buttons across its min–max; choosing `N` renders `N` seat
    dropdowns.
  - A player chosen in one slot is not offered in the others (dedupe).
  - Selecting a playgroup pre-fills the slots; Start posts `participantPlayerIds` in slot order to
    `POST /api/games` (assert via `fetchMock.mock.calls`).
  - Start is disabled until all slots are filled.
- `pnpm test` (frontend Vitest) passes; run the project's typecheck/build if pre-commit does.

## When done

1. Update frontmatter; `git mv` to `prompts/done/`.
2. Update `prompts/startnewsession.md` (Current state / Last session) to record the new start-game
   UX, and `docs/decisions.md` for the design (dropdown over cards; count-buttons + slot dropdowns
   replacing the checkbox list and drag-reorder; sort = play-count desc then alpha).
3. **One commit on `dev`** (`feat:`, no AI mention), specific paths only, no push. Report
   hash/files/message and any follow-ups (e.g. if `@dnd-kit` is now unused project-wide and could be
   removed later).
