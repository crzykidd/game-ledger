---
name: 14-ui-polish
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: UI polish pass complete — primary buttons fixed (vibrant hover/glow, distinct disabled state), responsive hamburger nav with mobile drawer, login polished (Dices logo, placeholders, password show/hide toggle), lucide-react icons throughout nav/buttons/empty states, shadows/hierarchy (--shadow-sm/md/lg tokens, card shadow), EmptyState component, skeleton loaders in Dashboard, score entry improvements (stepper +/- buttons, bigger input, Flag icon for ended-round), dark mode tokens fixed (hardcoded colors replaced with CSS custom properties), drag-to-reorder with @dnd-kit (closes #2), all 52 tests pass.
---

# Task: UI/UX polish pass + drag-to-reorder + verify the game loop

The app is functional but visually unpolished. Do a real polish pass driven by the concrete
findings below (gathered from screenshots of the running app), add drag-to-reorder for seats
(closes Gitea #2), and verify the full game loop + dark mode in a browser.

## Before you start

- Read `CLAUDE.md` and `docs/spec.md` (Frontend: responsive + theming, the design system).
- Reuse and EXTEND the existing design system (`frontend/src/design-system/`: tokens.css,
  components, styles.css). Don't rewrite it — raise its quality. Theme tokens only, no hardcoded
  colors (keep light + dark working).
- Bring up the dev stack on FREE ports to verify (`DEV_APP_PORT=... docker compose -f
  docker-compose.dev.yml up --build -d`; say which). Docker + Playwright available. Log in via
  the wizard (fresh DB) or create data as needed.

## Working tree check

`git status --porcelain` should show only `prompts/14-ui-polish.md`. Otherwise list and ask.

## Concrete findings to fix

1. **Primary buttons look disabled.** "Start game" (StartGamePage) and "Save Round" (GamePage)
   render washed-out/light while the dashboard "Start New Game" is vibrant. Make enabled primary
   buttons consistently vibrant/obviously clickable; give clearly-distinct disabled, hover,
   active, and focus states. Audit the Button variants so this can't drift.
2. **Responsive header/nav.** On mobile the "Game Ledger" wordmark wraps to two lines and the nav
   links cram together. Implement a proper responsive nav — a hamburger/drawer (or compact menu)
   on mobile, inline on desktop — with the user menu accessible. Tighten header height. Add a
   simple logo/mark + a bit of brand identity (tasteful accent usage; this is a games app).
3. **Login screen is barren.** Add the logo/title, input placeholders, sensible vertical
   placement (don't float high), focus styles, and a password show/hide toggle. (No real
   "forgot password" backend in M1 — a hint is fine.)
4. **Iconography.** Add a lightweight icon set (e.g. `lucide-react`) and use icons in nav,
   primary buttons, status badges, and empty states. The UI is currently text-only and flat.
5. **Depth, spacing, hierarchy.** Add subtle elevation/shadows and a consistent spacing scale;
   constrain content max-width and reduce the vast dead whitespace on short pages; improve
   typographic hierarchy. Style tables (admin users, Running Totals, Final Rankings, history)
   with proper headers, row dividers/hover, and badges.
6. **Empty + loading states.** Add skeletons/placeholders while loading (dashboard "Active
   Games" currently shows a bare spinner) and friendly empty states (no active games, no
   history, no players). **Handle the Results page when a game isn't actually finished / has no
   results** — don't show a blank "Game Over / Final Rankings" with an empty table.
7. **Score entry.** Bigger touch targets; make the per-player number input larger and
   thumb-friendly (stepper); make the "Ended round" pick-one selection obvious; clearer round
   progression + leader highlight.
8. **Dark mode.** Verify the dark theme actually renders well across ALL screens and fix any
   contrast issues. (Note: the account `themePref` overrides localStorage; to test dark, set the
   logged-in user's theme to DARK via the profile toggle and/or emulate
   `prefers-color-scheme: dark`.)

## Drag-to-reorder seats (closes Gitea #2)

Add a DnD library (e.g. `@dnd-kit/core` + `@dnd-kit/sortable`) and make the seat-order list
**drag-to-reorder** (touch-friendly for mobile, important for 4+ players). Keep the up/down
arrow buttons as an accessible fallback. The order sent to `POST /api/games` must reflect the
dragged order.

## Verify (definition of done)

- Bring up the stack and drive the **full loop in a browser**: wizard/login → create players →
  start a Skyjo game (drag-reorder seats) → enter ≥2 rounds (totals update) → **Finish →
  Results shows populated Final Rankings (low-wins winner)** → History shows it as **Completed**.
  If finish/results is genuinely broken (not just a fragile confirm step), fix it.
- Capture before/after screenshots (desktop + mobile, light + dark) into a scratch dir and
  confirm the improvements; the app must look clearly more polished and be fully responsive.
- `pnpm lint` / `pnpm build` / `pnpm test` all green; add/adjust frontend tests for new
  components (nav, drag-reorder, empty states). Tear down the stack after.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/14-ui-polish.md prompts/done/`.
3. Log notable choices (icon lib, dnd lib, nav pattern, any finish/results fix) in
   `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`feat: UI polish, responsive nav, drag-to-reorder seats`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, what changed per finding, whether drag-to-reorder is
   done (so #2 can be closed), the finish→results verification result, and confirmation dark
   mode + mobile look good (reference your screenshots).
