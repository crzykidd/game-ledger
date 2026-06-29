---
name: 21-convert-auth-screens
status: done
created: 2026-06-25
model: sonnet
completed: 2026-06-25
result: >
  Converted Login, InstallWizard, AcceptInvite, PasswordReset, and Profile to
  Tailwind + shadcn-style foundation. All unit tests (63) and e2e tests
  (fresh-db-setup-gate + invite-flow, 4/4) green. Lint and build pass. Screens
  are cohesive with the dashboard; other unconverted screens untouched.
---

# Task: Convert the auth/account screens to the new UI foundation

Step 2 of the app-wide migration. Convert the **login, install wizard, accept-invite signup,
password reset, and profile** screens onto the shared Tailwind + shadcn/ui + Framer Motion
foundation, matching the new dashboard. Keep behavior + the test net green.

## Before you start

- Read `CLAUDE.md`. App at commit `4a001db`. The foundation is now shared at
  `frontend/src/components/ui/` (Button, Card, Badge, Avatar, Skeleton, SegmentedControl, `cn()`)
  + `frontend/src/components/AppShell.tsx`, Tailwind app-wide with **preflight OFF** (coexists
  with the still-unconverted screens). The Dashboard (`frontend/src/routes/Dashboard.tsx`) is the
  reference for the look/patterns.
- Don't touch the user's live data; test on localhost / your own isolated stack.

## Working tree check

`git status --porcelain` should show only `prompts/21-convert-auth-screens.md`. Otherwise list/ask.

## What to do

Convert these screens to the new foundation (reuse `components/ui` + Tailwind; keep all data
wiring, validation, and flows identical):
- **Login** (`Login` / `LoginWithState`) — clean centered card, branded, a tasteful entrance
  animation, the password show/hide, lockout/error messaging preserved.
- **Install wizard** (`InstallWizard`) — first-run create-Super-Admin; keep the one-time guard +
  the fields (fullName, nickname, email, password) and the post-setup auth behavior.
- **Accept-invite signup** (`AcceptInvite`) — prefill, fields, the "email already in use → forgot
  password?" handling.
- **Password reset** (`PasswordReset`).
- **Profile** — theme toggle (light/dark/system) + logout, on the new look.

Make them feel cohesive with the dashboard (typography, spacing, gradients/accents, dark mode).
Mobile-first + responsive. Use `components/ui` primitives; don't reintroduce hand-rolled CSS for
these screens.

## Conventions to honor

- **Preserve behavior + keep the test net green.** These screens are covered by e2e
  (`fresh-db-setup-gate.e2e.ts`, `invite-flow.e2e.ts`) and unit tests (AcceptInvite, PasswordReset,
  AuthContext, etc.). Keep accessible names/roles/labels stable; if markup changes break a
  selector, update the test or add a stable `data-testid` — do NOT weaken/delete assertions.
- Other unconverted screens (play, players, history, admin) must stay exactly as before
  (preflight stays off, no bleed).

## Verify (definition of done)

- `pnpm lint` / `pnpm build` pass; `pnpm test` (frontend) green; **e2e green** — run it against an
  isolated Postgres (temp `docker run` postgres on a non-standard port, set `E2E_DATABASE_URL`;
  NEVER `down -v` the `game-ledger` project; clean up the container).
- Capture screenshots of login + wizard + accept-invite (desktop + mobile, light + dark) into a
  scratch dir and confirm they look cohesive with the dashboard.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-25`/`result`).
2. `git mv prompts/21-convert-auth-screens.md prompts/done/`.
3. Log notable choices in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`feat: convert auth/account screens to the new UI foundation`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, the screens converted, e2e result, screenshot paths,
   and confirmation the other unconverted screens are unaffected.
