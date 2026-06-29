---
name: 06-frontend-foundation
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: Design system (tokens.css + styles.css), theme mechanism (CSS custom properties + data-theme attribute + localStorage FOUC prevention), API client with CSRF, AuthContext, ProtectedRoute, full widget library (Button, TextField, Card, Modal, Table, Toast, Spinner, AppBar, FormField), all auth flow pages (InstallWizard, Login, AcceptInvite, PasswordReset, Profile, Dashboard), React Router setup, Vitest + RTL tests (28 passing). Backend: PATCH /api/auth/me added with patchMe service + unit test.
---

# Task: Frontend foundation — design system, app shell, auth UI

Build the frontend base everything else renders on: the **design system** (theme tokens +
themed widgets), the **app shell** (routing, auth context, API client with CSRF), and the
**auth flows** (install wizard, login, accept-invite signup, password reset, profile/theme).
Mobile-first + a wide layout. No admin screens (prompt 07) or game play (prompt 08).

## Before you start

- Read `CLAUDE.md` and `docs/spec.md` (Frontend — responsive + theming; the 3-tier UI model is
  prompt 08's concern, but build the **design system** it depends on here).
- Backend is live (prompts 00–05). Relevant endpoints: `GET /api/setup/status`, `POST /api/setup`,
  `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (returns user + effective
  permissions + `themePref`), invite accept `GET/POST /api/invites/accept/:token`, reset
  `GET/POST /api/resets/:token`. **CSRF:** read the `gl_csrf` cookie and send it as the
  `X-CSRF-Token` header on all mutations. Reuse contract enums/types from `packages/contract`.

## Working tree check

`git status --porcelain` should show only `prompts/06-frontend-foundation.md`. Otherwise list and ask.

## What to do

**Design system**
- **Theme tokens** as CSS custom properties (color/spacing/type/radii) with **light + dark**
  values; default **follow system** (`prefers-color-scheme`), overridable per user.
- Apply the theme **before first paint** (no flash of wrong theme); when set to `system`,
  live-update on the media query.
- **Persist the user's choice** on their account: add a small backend endpoint
  `PATCH /api/auth/me` (or `PUT /api/me/theme`) that updates the current user's `themePref`
  (`LIGHT|DARK|SYSTEM`), and a theme toggle in the UI that calls it (+ optimistic local apply).
- A small **themed widget library** (the primitives later prompts compose): Button, TextField,
  Card, Modal/Dialog, Table, Toast/inline-error, Spinner, AppBar/nav, FormField. Big touch
  targets, accessible, responsive (mobile + wide).

**App shell**
- Routing (React Router). An **auth context** that loads `GET /api/auth/me`, exposes the user +
  effective permissions + login/logout, and gates **protected routes** (redirect to login).
- An **API client** wrapper: base `/api`, sends credentials (cookies), injects the
  `X-CSRF-Token` header on mutations, surfaces structured errors (incl. the login-lockout and
  "email already in use" messages).
- A responsive layout shell (mobile nav + wide layout) honoring the design system + theme.

**Auth flows (UI)**
- **Install wizard:** on load, if `GET /api/setup/status` shows incomplete, route to a one-time
  wizard that creates the first SUPER_ADMIN (`POST /api/setup`), then logs in.
- **Login:** email/password, error + lockout messaging.
- **Accept-invite signup:** public page from an invite link — fetch the prefill
  (`GET /api/invites/accept/:token`), show nickname/email, collect fullName/nickname/password
  (client-side password-policy hint), submit (`POST`), handle the email-in-use case.
- **Password reset:** public page from a reset link — `GET`/`POST /api/resets/:token`.
- **Profile/theme:** a simple profile area with the light/dark/system theme toggle + logout.

## Conventions to honor

- React + Vite + TypeScript; reuse `packages/contract` types/enums. Keep components in a clear
  structure (e.g. `src/design-system/`, `src/api/`, `src/routes/`). No heavyweight
  component-framework dependency unless it clearly earns its place; a headless primitive lib is
  fine. Don't build admin or game screens.
- Mobile-first; verify both mobile and wide layouts. Theme tokens — never hardcode colors in
  components.

## Tests (definition of done)

`pnpm lint`/`pnpm build` green; `pnpm test` green (set up frontend testing — Vitest +
React Testing Library — if not already present, and add it to `pnpm test`):
- theme: default follows system; toggling persists (calls the endpoint) and applies without a
  full reload; no FOUC logic regression
- auth context: unauthenticated is redirected from a protected route; `me` populates user/perms
- API client: injects `X-CSRF-Token` on a mutation; surfaces a structured error
- login form: submit calls the endpoint; shows the lockout error
- accept-invite + reset pages render from a token and submit
- the new `themePref` endpoint: updates the current user's preference (backend test)

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/06-frontend-foundation.md prompts/done/`.
3. Log non-obvious choices (theming approach, widget lib, routing/auth-context shape, any UI
   libs added) in `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit (`feat: frontend design system, app shell, and auth UI`),
   clean message, **no AI mention**. Stage specific paths, don't push.
5. **Report back**: commit hash + message, the design-system + widget API (so prompts 07/08
   reuse it), the auth-context/API-client shape, and the theme mechanism.
