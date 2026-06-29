---
name: 22-convert-play-screens
status: done
created: 2026-06-25
model: sonnet
completed: 2026-06-25
result: >
  Converted StartGamePage, GamePage, ResultsPage, HistoryPage to AppShell +
  Tailwind + shadcn-style components/ui/. Added loading prop + spinner to new
  Button; created Dialog component. Kept all CSS class names that e2e and unit
  tests use as selectors (score-sheet, totals-table__row--leader,
  results-table__row--winner, history-card, status-badge--*, etc.). All 12 e2e
  green, 63 unit tests green, lint + build clean. Players/admin screens
  untouched.
---

# Task: Convert the play screens to the new UI foundation

Step 3 of the migration — the most important and most test-covered screens. Convert
**StartGamePage, GamePage (score entry / finish-order), ResultsPage, and HistoryPage** onto the
shared Tailwind + shadcn/ui + Framer Motion foundation, matching the dashboard. Behavior must be
identical and **all 12 e2e must stay green** — this is the core gameplay loop.

## Before you start

- Read `CLAUDE.md`. App at commit `5d3b994`. Shared foundation: `frontend/src/components/ui/`
  (Button, Card, Badge, Avatar, Skeleton, SegmentedControl, `cn()`) + `AppShell`. Tailwind
  app-wide, **preflight OFF** (coexists with unconverted screens). `Dashboard.tsx` + the converted
  auth screens are the reference for the look.
- These screens carry heavy coverage: e2e `skyjo-/uno-/g-five-crowns-/president-happy-path`,
  `picker-cancel-delete`, plus `play.test.tsx` and others. Read them first so you preserve the
  selectors/roles/test-ids they depend on.
- Don't touch the user's live data; test on localhost / your own isolated stack.

## Working tree check

`git status --porcelain` should show only `prompts/22-convert-play-screens.md`. Otherwise list/ask.

## What to do

Convert, preserving ALL behavior, data wiring, and the capture-driven logic:
- **StartGamePage** — keep the clickable module cards (no default selection), participant
  selection, **drag-to-reorder seats** (@dnd-kit), per-module player-count validation, Start
  disabled until valid. Make it look great on the new foundation.
- **GamePage** — the score-entry form (numeric per-round with steppers + ended-round toggle for
  Skyjo), the **finish-order drag UI** for rank_order (President), running totals, autosave +
  409 handling, Cancel/Delete (creator-only), the module reference panel, resume.
- **ResultsPage** — Final Rankings (rank-only when no score), winner highlight.
- **HistoryPage** — game list with status badges (Active/Complete/Abandoned), filters, delete.

Use `components/ui` primitives + Tailwind; remove these screens' reliance on the hand-rolled
`design-system` CSS. Light + dark, mobile-first.

## Conventions to honor

- **Behavior identical; keep the FULL e2e green.** If your markup changes a class/role/text the
  e2e or unit tests rely on, update the test selector or add a stable `data-testid` — do NOT
  weaken or delete assertions. The numeric save flow, finish-order flow, cancel/delete,
  picker-non-default, and the per-game name/reference all have coverage that must keep passing.
- Other still-unconverted screens (players, admin) stay exactly as before (preflight off).

## Verify (definition of done)

- `pnpm lint` / `pnpm build` pass; `pnpm test` (frontend) green; **ALL 12 e2e green** — run the
  full suite against an isolated Postgres (temp `docker run` postgres on a non-standard port, set
  `E2E_DATABASE_URL`; NEVER `down -v` the `game-ledger` project; clean up the container).
- Capture screenshots of start-game, score entry, results, history (desktop + mobile, light +
  dark) into a scratch dir; confirm cohesion with the dashboard + good dark mode.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-25`/`result`).
2. `git mv prompts/22-convert-play-screens.md prompts/done/`.
3. Log notable choices in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`feat: convert play screens to the new UI foundation`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, screens converted, the **full e2e result (12/12?)**,
   screenshot paths, and confirmation players/admin are unaffected.
