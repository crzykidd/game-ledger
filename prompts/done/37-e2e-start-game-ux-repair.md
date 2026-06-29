---
name: 37-e2e-start-game-ux-repair
status: done
created: 2026-06-28
model: sonnet
completed: 2026-06-28
result: All 20 e2e tests pass. Added startGameViaUi helper to helpers.ts; migrated 10 specs from old radio/checkbox flow to new dropdown+count-buttons+slot-selects UX; committed cribbage happy-path spec with screenshots and dead code removed.
---

# Task: Repair the e2e suite for the new start-game UX + land the cribbage happy-path

Prompt 34 rewrote `StartGamePage` (radiogroup-of-cards + checkbox player list → **game `<select>`
dropdown + player-count buttons + per-seat `<select>` grid**) but did **not** update the Playwright
e2e specs that drive it. The ~10 existing happy-path/flow specs still use the old selectors
(`getByRole('radio', …)`, `input[type=checkbox]`) and now fail. Update them to the new UX, and
commit the already-written cribbage happy-path spec (the one game that had none).

## Before you start

- Read `CLAUDE.md` (conventions, **no AI mention in commits**, one prompt = one commit on `dev`).
- Read `prompts/startnewsession.md` → "How to verify" (isolated throwaway DB, `E2E_DATABASE_URL`,
  the Playwright harness builds its own backend `dist` + vite-preview).
- Read the **new** `frontend/src/play/StartGamePage.tsx` to confirm the selectors below, and an
  already-migrated reference: **`e2e/g-cribbage-happy-path.e2e.ts`** (untracked — it uses the new
  flow and passes). Use it as the pattern.

## Working tree check

`git status --porcelain` will show `e2e/g-cribbage-happy-path.e2e.ts` (untracked — you will clean up
and commit it) and this prompt file (exempt). Recent relevant commits: `ba1f7d3` (cribbage module),
`80d5b2d` (cribbage board), `b827ada` (board dark-mode fix). Surface any other unexpected dirty
files before touching.

## Codebase facts (researched — trust these)

- **New start-game flow** (`StartGamePage.tsx`):
  - Game picker is `<select id="game-select">`; **option `value` is the module id** (e.g. `uno`,
    `skyjo`, `hearts`, `coup`, `gin-rummy`, `five-crowns`, `president`, `cards-against-humanity`,
    `cribbage`), option text is `"<Name> (min–max)"`. Select with
    `page.locator('#game-select').selectOption('<moduleId>')`.
  - After a game is chosen, **player-count buttons** render for its min–max:
    `page.getByRole('button', { name: '<N>', exact: true }).click()`.
  - Then **seat selects** `#slot-0..#slot-(N-1)`; each lists players by nickname. Fill with
    `page.locator('#slot-<i>').selectOption({ label: '<nickname>' })`. A player chosen in one slot
    is removed from the others, so fill in order.
  - Submit: `getByRole('button', { name: 'Start game' })` (enabled only when game + count + all
    distinct seats are set).
  - Optional playgroup `<select id="playgroup-select">` (only shown if playgroups exist) — ignore
    unless a spec needs it.
- **Old flow to replace** (delete these patterns): `page.getByRole('radio', { name: /Game/i }).click()`
  and the `for (const name of players) { …input[type=checkbox].check() }` loop.
- **Specs needing migration** (use the old selectors — confirmed via grep):
  `e2e/uno-happy-path.e2e.ts`, `e2e/skyjo-happy-path.e2e.ts`, `e2e/president-happy-path.e2e.ts`,
  `e2e/g-cah-happy-path.e2e.ts`, `e2e/g-hearts-happy-path.e2e.ts`, `e2e/g-five-crowns-happy-path.e2e.ts`,
  `e2e/g-coup-happy-path.e2e.ts`, `e2e/g-gin-rummy-happy-path.e2e.ts`, `e2e/undo-last-round.e2e.ts`,
  `e2e/picker-cancel-delete.e2e.ts`. (`e2e/report/index.html` is generated output — ignore.)
  For `undo-last-round` and `picker-cancel-delete`, inspect which module they start and map it to its
  id from `modules/<id>/module.yaml`.
- **Player counts matter now:** the old checkbox flow let you tick any number; the new flow requires
  clicking the count button = number of players, then filling that many seats. Each spec creates
  distinct guest players, so seat-fill is 1:1. Match the count button to the players the spec creates
  (and to the game's min–max).
- The harness: `webServer` runs `backend/dist/main.js` + `vite preview` (so **build first**:
  `pnpm --filter backend build` and `pnpm --filter frontend build`), `MODULES_DIR` points at repo
  `modules/` (cribbage loads). Tests self-seed via `runSetupIfNeeded`.

## What to do

1. **Add a shared helper** to `e2e/helpers.ts` to encapsulate the new flow and keep specs DRY, e.g.:
   `export async function startGameViaUi(page, moduleId: string, playerNicknames: string[]): Promise<void>`
   — navigates to `/play/new`, selects the module, clicks the count button = `playerNicknames.length`,
   fills `#slot-i` in order, clicks **Start game**, and asserts the URL is `/\/play\/[^/]+$/`.
2. **Migrate each spec** in the list to use `startGameViaUi(...)` (or the inline new selectors where a
   spec needs custom interaction). Remove all old radio/checkbox start-game code. Keep every spec's
   existing assertions, round entry, finish, results, dashboard/history checks intact — only the
   game-creation step changes. Where a spec starts a second game (e.g. uno), migrate that too.
3. **Clean up and keep `e2e/g-cribbage-happy-path.e2e.ts`:** it currently writes screenshots to an
   absolute `/tmp/.../scratchpad/...` path (one-off visual verification by the orchestrator). **Remove
   those `page.screenshot(...) / board.screenshot(...)` lines** (keep all assertions), so the
   committed test is clean and portable. It already uses the new flow — refactor it to call the shared
   helper for consistency.
4. If migrating reveals a spec relied on old behavior the new UI changed (e.g. selecting more players
   than the game's max), fix the spec to the new constraints and note it.

## Conventions to honor

- TypeScript; match the existing e2e style and `helpers.ts` exports. No product-code changes — this
  is test-only (if you find a genuine product bug, stop and report, don't patch around it).

## Tests (definition of done)

- Build backend + frontend, bring up an **isolated** throwaway DB on `E2E_DATABASE_URL` (per
  `prompts/startnewsession.md`), and run the **full** suite: `E2E_DATABASE_URL=… pnpm test:e2e`.
  **All specs must pass**, including the new cribbage one. Report the pass count.
- Do not weaken assertions to make them pass; if a spec can't pass for a real reason, report it.

## When done

1. Update this file's frontmatter (`status: done`, `completed: 2026-06-28`, `result`); `git mv` to
   `prompts/done/`.
2. `docs/decisions.md` (newest at top): note the e2e suite was migrated to the new start-game UX via a
   shared `startGameViaUi` helper, and that cribbage now has a happy-path spec.
3. Update `prompts/startnewsession.md` (Last session / test counts) to reflect the green e2e suite +
   cribbage e2e.
4. **One commit on `dev`** (`fix:` — the suite was broken; or `test:` if preferred, but keep it a
   Conventional-Commits prefix the repo uses — use `fix:`), no AI mention, specific paths only
   (the migrated specs, `e2e/helpers.ts`, the new cribbage spec, docs, this moved prompt). No push.
   Report hash / files / message / full-suite pass count.
