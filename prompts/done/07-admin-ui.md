---
name: 07-admin-ui
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: >
  Admin area implemented: Users (list + show-disabled toggle + detail with role/disable/permissions/groups),
  Invites (create modal → copyable link, list with status, revoke/regenerate),
  Resets (generate from user detail → copyable link, list with claimed status),
  Groups (CRUD + permission grants/denials modal),
  Audit log (recent 100 entries table). AdminLayout with per-permission tab gating.
  tier.ts mirrors backend canActOn(). CopyLink reusable component.
  11 Vitest+RTL tests; all 39 frontend tests pass; lint+build clean.
---

# Task: Admin UI — user management, invites, resets, groups, audit

Build the admin screens on the prompt-06 frontend foundation: managing users, the invite +
reset copy-link flows, groups/permissions, and the audit log. Permission-gated. Reuse the
design system, auth context, and API client — don't reinvent them.

## Before you start

- Read `CLAUDE.md` and `docs/user-management.md` (roles/tiers, disable=delete + show-disabled,
  invites/resets views, audit log, nickname-not-email visibility).
- Reuse from prompt 06: widget library (`Button`, `TextField`, `Card`, `Modal`, `Table`,
  `Toast`/`useToast`, `Spinner`, `AppBar`), `useAuth()` (`user`, `hasPermission`), the
  `apiClient` (auto CSRF + structured errors), routing patterns, theme tokens (no hardcoded
  colors).
- Backend endpoints (prompt 03, `9c74403`): `/api/users` (+`includeDisabled`), `/api/users/:id`
  (PATCH role/profile, `/disable`,`/enable`,`/permissions`,`/groups`,`/reset-link`),
  `/api/groups` (+`/:id/permissions`), `/api/invites` (create/list/revoke/regenerate),
  `/api/resets` (list), `/api/audit`. Permissions: `MANAGE_USERS`, `MANAGE_GROUPS_ROLES`,
  `INVITE_USERS`, `SEND_PASSWORD_RESET`, `VIEW_ALL`.

## Working tree check

`git status --porcelain` should show only `prompts/07-admin-ui.md`. Otherwise list and ask.

## What to do

Add an **Admin** area (nav entry in `AppBar`, gated by the relevant permissions; hide entirely
if the user has none). Protected routes under e.g. `/admin/*`.

- **Users** (`MANAGE_USERS`): searchable list (`Table`) with a **"show disabled" toggle**
  (default hidden); columns nickname/role/state/last-login. Reference users by **nickname**, not
  email. Detail view: change role, **disable/enable** (disable = delete), per-user permission
  toggles, group membership. **Tier-aware UI** — hide/disable actions the current user can't
  perform on a higher/equal tier (mirror `canActOn`; the backend enforces it, the UI shouldn't
  offer impossible actions).
- **Invites** (`INVITE_USERS`): create (modal: email + optional guest player) → on success show
  the **copyable invite link** (copy-to-clipboard + toast). List with **status**
  (pending/claimed/expired/revoked) → email/account; revoke / regenerate actions.
- **Resets** (`SEND_PASSWORD_RESET`): from a user's detail, **generate a reset link** → show
  copyable link. A list of issued resets with **claimed status**.
- **Groups** (`MANAGE_GROUPS_ROLES`): list/create/delete groups and edit their permission
  grants/denials (e.g. a "No-Invite" group).
- **Audit log** (`VIEW_ALL`): recent entries table (actor, action, target, time).

## Conventions to honor

- React + Vite + TS; reuse `packages/contract` enums (Role, Permission, etc.) and the prompt-06
  components/context/client. Mobile-first + wide layout; theme tokens only.
- **Permission-gate every action** via `hasPermission(...)` so the UI never offers something the
  backend will reject. Use toasts/inline errors for failures (incl. tier-rule 403s).
- Copy-link flows: the raw token/link is shown once on creation — make it easy to copy.

## Tests (definition of done)

`pnpm lint`/`pnpm build`/`pnpm test` (frontend) green:
- users list renders; **show-disabled toggle** changes the query/results
- a user without `MANAGE_USERS` doesn't see the Users admin entry/route
- create-invite flow surfaces a **copyable link**; the list reflects status
- generate-reset-link surfaces a copyable link
- tier-aware UI: actions on a higher tier are hidden/disabled
- group create + permission edit renders and submits

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/07-admin-ui.md prompts/done/`.
3. Log non-obvious choices (admin routing, tier-aware gating approach, copy-link UX) in
   `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit (`feat: admin UI for users, invites, resets, groups, audit`),
   clean message, **no AI mention**. Stage specific paths, don't push.
5. **Report back**: commit hash + message, the admin routes/screens added, and any reusable
   patterns prompt 08 (play UI) should follow.
