---
name: 24-retire-old-design-system
status: done
created: 2026-06-25
model: sonnet
completed: 2026-06-25
result: Retired design-system/. Toast→components/ui/Toast, Spinner→components/ui/Spinner, theme→lib/theme.ts. PlayLayout switched to AppShell. All design-system/ files deleted. Grep clean. All tests pass (63 unit + 12 e2e).
---

# Task: Retire the hand-rolled design system (migration cleanup)

Final step of the UI migration. Every screen is now on the Tailwind + shadcn/ui foundation; this
removes the leftover hand-rolled `design-system/` system. Do it carefully — some converted
screens kept old CSS class names (`.score-sheet`, `.totals-table__row--leader`, etc.) **as e2e
selectors**, so those class names must remain in the JSX even though their old CSS goes away.

## Before you start

- Read `CLAUDE.md`. App at commit `1e8e45d`. Still importing the old system (per the prior
  report):
  - `useToast` + `ToastProvider` from `design-system/components/Toast` — used app-wide
  - `Spinner` from `design-system/components/Spinner` — `auth/ProtectedRoute.tsx`, `routes/index.tsx`
  - `AppBar` from `design-system/components/AppBar` — `play/PlayLayout.tsx`
  - `applyTheme`/`initTheme` from `design-system/theme` — `auth/AuthContext.tsx`, `main.tsx`, etc.
- Don't touch the user's live data; test on localhost / your own isolated stack.

## Working tree check

`git status --porcelain` should show only `prompts/24-retire-old-design-system.md`. Otherwise list/ask.

## What to do

1. **Migrate the shared pieces into the new foundation** (`frontend/src/components/`):
   - **Toast** (`ToastProvider` + `useToast`) → a new Tailwind-styled `components/ui/Toast` with
     the SAME API; update all import sites.
   - **Spinner** → `components/ui/Spinner` (Tailwind); update import sites.
   - **theme util** (`applyTheme`/`initTheme`/`getCurrentTheme`/`setThemePref` + `theme.test.ts`)
     → move to a kept location (e.g. `frontend/src/lib/theme.ts`); update all imports. Keep the
     system-resolves-to-explicit-`data-theme` behavior intact.
   - `play/PlayLayout.tsx` — if it still uses the old `AppBar`, switch to `AppShell` (or remove
     PlayLayout if it's now unused).
2. **Delete the old design system** once nothing imports it: the `design-system/components/*`
   (AppBar, Button, Card, Modal, Table, TextField, FormField, Toast, Spinner, etc.) and
   `tokens.css` / `styles.css`. **Keep the e2e-selector class names that remain in converted
   screens' JSX** — they're now just hooks for tests, not styled by the deleted CSS, which is
   fine. Verify those screens still look correct (they're Tailwind-styled now).
3. Make sure dark mode + the no-FOUC theme still work after the move.

## Conventions to honor

- **Keep ALL tests green** — unit + the full e2e. If removing old CSS visually breaks a converted
  screen, that means the conversion was incomplete — fix the screen with Tailwind (don't re-add
  the old CSS). Don't weaken/delete assertions; update import paths/selectors as needed.

## Verify (definition of done)

- `pnpm lint` / `pnpm build` pass; `pnpm test` (frontend) green; **full e2e green** (isolated
  Postgres on a non-standard port via temp `docker run`, `E2E_DATABASE_URL`; NEVER `down -v` the
  `game-ledger` project; clean up the container).
- `grep -rn "design-system" frontend/src` returns NOTHING (the folder is gone).
- Capture screenshots across the app (dashboard, score entry, history, admin, login) in dark mode
  to confirm nothing lost styling when the old CSS was removed.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-25`/`result`).
2. `git mv prompts/24-retire-old-design-system.md prompts/done/`.
3. Log the retirement + where Toast/Spinner/theme moved in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`refactor: retire the hand-rolled design system`), clean
   message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, what moved where, confirmation `design-system/` is
   gone and `grep design-system` is clean, the full e2e result, and screenshot paths.
