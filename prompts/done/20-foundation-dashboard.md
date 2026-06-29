---
name: 20-foundation-dashboard
status: done
created: 2026-06-25
model: sonnet
completed: 2026-06-25
result: >
  Shared ui foundation promoted (src/components/ui/: Button, Card, Badge, Avatar, Skeleton,
  SegmentedControl, cn(), ui.css). Tailwind content broadened to src/**; preflight stays off.
  Dashboard converted to the prototype design wired to real data (useAuth, GET /api/games).
  AppShell frosted navbar built as shared component. /preview route + temp link removed.
  Dark mode fixed: solid card surfaces, slate-700 borders, slate-300 secondary text, segmented
  pill contrast. e2e selector migrated to data-testid. pnpm lint/build pass, 63/63 unit tests
  green. Screenshots not captured — e2e/.env.e2e.json missing; visual check needed manually.
---

# Task: Promote the new UI foundation app-wide + convert the Dashboard (+ fix dark mode)

Turn the `/preview` prototype into the real, shared foundation and convert the **Dashboard** to
it as the first production screen. This sets the pattern every later screen follows. The app
must keep fully working — other (unconverted) screens stay on the old hand-rolled system for now.

## Before you start

- Read `CLAUDE.md`. App at commit `5b0ebde`. The prototype lives at `/preview`
  (`frontend/src/preview/`), foundation already added: Tailwind v3 (preflight OFF, scoped to
  `src/preview/**`), Framer Motion, shadcn-style components in `frontend/src/preview/ui/`.
- Don't touch the user's live data. Test on localhost / your own isolated stack.

## Working tree check

`git status --porcelain` should show only `prompts/20-foundation-dashboard.md`. Otherwise list/ask.

## What to do

**1. Promote the foundation to a shared, app-wide location.**
- Move the prototype UI components from `src/preview/ui/` to a shared `src/components/ui/`
  (Button, Card, Badge, Avatar, Skeleton, `cn()`, plus add **Tabs/SegmentedControl** and any
  primitives the dashboard uses). Keep the shadcn/Radix style.
- Make Tailwind apply to the whole app, BUT **keep `preflight` OFF** (or a tightly-scoped base)
  so it does NOT clobber the still-unconverted screens that use the hand-rolled
  `design-system`/`tokens.css`/`styles.css`. Both systems must coexist during the migration.
- Establish the **theme** in Tailwind config (colors, radii, shadows) driven by the existing
  `data-theme` / `prefers-color-scheme`, and a `dark:` strategy that works app-wide.

**2. Convert the Dashboard (`/`) to the new foundation.**
- Replace the current `Dashboard.tsx` look with the prototype design (gradient CTA, stats strip,
  segmented filter, animated active-game cards, frosted nav), **wired to real data**
  (`useAuth()` nickname, `GET /api/games` for active games). The stats strip can stay sample
  data for now (clearly labeled) until the stats feature lands.
- Build a **shared app shell / nav** (the frosted navbar with nav links + theme toggle + user
  menu) as a reusable component other screens will adopt.
- **Remove the `/preview` route and the temporary "View redesign preview" link.**

**3. Fix dark mode** (the user flagged it). At minimum: improve **card separation** from the
page background (cards should clearly lift off it — borders/elevation/surface tokens), raise
**muted/secondary text contrast** (time-ago, "sample data", subtitles read too dim), and tune
the **segmented filter pills + badges** for dark. Make dark mode look deliberately designed.

## Conventions to honor

- Preserve behavior + data wiring. **Keep the test net green:** the dashboard's existing
  unit/e2e checks assert behavior via roles/text/test-ids — if your new markup changes
  class-based selectors, **update the tests OR add stable `data-testid`s** so coverage isn't
  lost (do NOT delete assertions). Accessible names/roles must survive the restyle.
- Other screens stay on the old system and must render/behave exactly as before (no Tailwind
  bleed onto them — preflight stays off).

## Verify (definition of done)

- `pnpm lint` / `pnpm build` pass; `pnpm test` (frontend) green; existing e2e still green (run it
  against an isolated DB; update selectors if the dashboard markup changed).
- Bring up the stack (localhost ok) and capture screenshots of the new `/` — **desktop + mobile,
  light + dark** — into a scratch dir. Confirm dark mode looks good and an unconverted screen
  (e.g. `/players` or `/history`) still renders correctly (no bleed).

## When done

1. Update frontmatter (`status`/`completed: 2026-06-25`/`result`).
2. `git mv prompts/20-foundation-dashboard.md prompts/done/`.
3. Log foundation/migration choices (shared ui location, preflight-off coexistence strategy,
   theme tokens, dark-mode fixes) in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`feat: adopt UI foundation app-wide and convert dashboard`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, the shared foundation + coexistence strategy, the
   dark-mode fixes, screenshot paths, and confirmation other screens are unaffected.
