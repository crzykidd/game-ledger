---
name: 19-dashboard-prototype
status: done
created: 2026-06-25
model: sonnet
completed: 2026-06-25
result: >
  Built /preview prototype route. Added Tailwind CSS v3 (preflight disabled, content scoped to
  src/preview/**), Framer Motion v12, Radix UI primitives, and shadcn/ui-style components
  (Button, Card, Badge, Avatar, Skeleton) under frontend/src/preview/ui/. Dark mode via
  data-theme mirroring into .preview-root. Mock stats strip, segmented filter with animated
  indicator, staggered card entrance, active game cards with hover lift/Resume CTA, gradient
  Start New Game CTA. Temporary preview link added to existing Dashboard. pnpm lint + build
  pass, all 63 tests green, original pages unchanged. 6 screenshots captured.
---

# Task: Prototype a redesigned dashboard (Tailwind + shadcn/ui + Framer Motion)

Build a **non-destructive** visual prototype of the dashboard on a modern UI foundation, to
evaluate a new design direction. The current app must keep working unchanged — this is a
side-by-side showcase. Make it genuinely impressive: modern, animated, refined controls — the
opposite of the current flat/blocky look.

## Before you start

- Read `CLAUDE.md`. App at commit `7d190c3`. Current frontend uses a hand-rolled design system
  (`frontend/src/design-system`, `tokens.css`, `styles.css`) — leave it intact.
- The current dashboard is `frontend/src/routes/Dashboard.tsx` (welcome, "Start New Game" CTA,
  Active Games list with Resume, links to Players/History). Reuse its DATA sources: `useAuth()`
  for the user, `GET /api/games` (via the existing `play` api) for active games.
- Don't touch the user's live data. Test on localhost / your own isolated stack.

## Working tree check

`git status --porcelain` should show only `prompts/19-dashboard-prototype.md`. Otherwise list/ask.

## What to do

**1. Add the modern UI foundation to the frontend** (without breaking existing pages):
- **Tailwind CSS** (v3) + PostCSS, wired into Vite. **Disable Tailwind's `preflight`** (or scope
  it) so it does NOT reset/clobber the existing hand-rolled pages. Tailwind classes should work
  on the new prototype page while the rest of the app renders exactly as before.
- **Framer Motion** for animation.
- **shadcn/ui style components** (Radix primitives + Tailwind): add the handful you need (e.g.
  Button, Card, Tabs/SegmentedControl, Badge, Avatar, Skeleton) under
  `frontend/src/preview/ui/` — you can hand-add them in the shadcn style (own the code), no need
  to run a network CLI if it's awkward. Support **light + dark** (Tailwind `dark:` + the existing
  `data-theme`/`prefers-color-scheme`).

**2. Build the prototype dashboard at a new route `/preview`** (protected, reachable while
logged in). Leave `/` (the current Dashboard) untouched. Add a small temporary link/button to
`/preview` from the current dashboard so it's reachable.
- Make it **sexy**: strong visual hierarchy, generous-but-tight spacing, real typographic scale,
  subtle gradients/elevation/shadows, **micro-interactions** (animated card entrance/stagger,
  hover lift, button press), and **refined dynamic controls** — e.g. a segmented filter, an
  animated "Start New Game" CTA, active-game cards with smooth Resume affordances, a small
  **stats-at-a-glance** strip (games played, wins, win-rate — mock the numbers if no endpoint,
  clearly), and tasteful icons. Fully **responsive** (great on mobile, richer on wide).
- Use REAL data where easy (user nickname, active games from `GET /api/games`); mock only the
  stats teaser, clearly labeled as sample.

## Conventions to honor

- Non-destructive: the existing app + all current routes render and behave exactly as before.
  Keep light/dark working on the prototype. Don't rip out the hand-rolled design system.
- TypeScript, accessible components (Radix gives this). `pnpm lint` + `pnpm build` must pass and
  existing tests stay green.

## Verify (definition of done)

- `pnpm lint` / `pnpm build` pass; existing `pnpm test` (frontend) stays green; the current app's
  pages are visually unchanged.
- Bring up the stack (localhost is fine for a read-mostly dashboard) and **capture screenshots of
  `/preview`** — desktop + mobile, light + dark — into a scratch dir, and confirm it looks
  polished/animated. Also confirm `/` still looks like before (no Tailwind bleed).

## When done

1. Update frontmatter (`status`/`completed: 2026-06-25`/`result`).
2. `git mv prompts/19-dashboard-prototype.md prompts/done/`.
3. Log the foundation choices (Tailwind config, preflight handling, which shadcn components,
   Framer Motion usage) in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`feat: dashboard redesign prototype (Tailwind + shadcn + Framer Motion)`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, the foundation added, how you kept it non-destructive
   (preflight handling), the `/preview` route, and where the screenshots are saved.
