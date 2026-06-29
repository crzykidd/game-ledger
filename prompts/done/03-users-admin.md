---
name: 03-users-admin
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: >
  Built user management, invites, password resets, groups, and audit log backend.
  All endpoints implemented per spec. 78 tests pass (13 new suites). Lint clean.
  Build green. Guest-Player linking confirmed: Player.userId is set on invite-accept.
---

# Task: User management, invites, password resets, groups, audit log (backend)

Build the admin/user-management API on top of the auth core: managing users, the typed-token
flows (invites + password resets via copy-paste links), groups/permission overrides, and the
audit log. **Backend only** — the admin UI is a later frontend prompt. **No email/SMTP** —
links are returned for copy-paste (Phase 1).

## Before you start

- Read `CLAUDE.md` and `docs/user-management.md` (roles/tiers, invites + guest linking, resets,
  disable=delete, audit log, the "email already in use" message).
- Built already (prompts 01–02): `Token` table (typed: INVITE/PASSWORD_RESET/SHARE, `tokenHash`,
  target columns, status), `Player` (guest = no `userId`), `Group`/`GroupPermission`/`UserGroup`,
  `UserPermissionOverride`, `AuditLog`. Reuse the auth surface from prompt 02:
  `AuthGuard`, `CsrfGuard`, `@RequirePermissions`, `@RequireRole`, `@CurrentUser`,
  `PermissionService.resolveEffectivePermissions`, `canActOn(actorRole, targetRole)`,
  argon2 hashing + password-policy validator, and the SHA-256 token-hash pattern.

## Working tree check

`git status --porcelain` should show only `prompts/03-users-admin.md`. Otherwise list and ask.

## What to do

**User management** (`manageUsers`; every action that targets another account must pass
`canActOn(actor.role, target.role)`):
- `GET /api/users` — list/search; **`includeDisabled` query flag** (default hides DISABLED).
- `GET /api/users/:id` — detail (role, state, group, effective permissions, lastLogin).
- `PATCH /api/users/:id` — change role (tier-checked), nickname/fullName.
- `POST /api/users/:id/disable` / `/enable` — **disable == delete** (no hard delete; history kept).
- `PUT /api/users/:id/permissions` — set per-user `UserPermissionOverride` toggles.
- `PUT /api/users/:id/groups` — set the user's group memberships.

**Groups** (`manageGroupsRoles`):
- CRUD `Group` + its `GroupPermission` grants/denials. (e.g. a "No-Invite" group.)

**Invites** (`inviteUsers`; copy-paste link, no email):
- `POST /api/invites` {email, optional `guestPlayerId`} → creates an `INVITE` token (24h,
  single-use, **hash stored, raw returned once** in the link), optionally bound to a guest
  `Player` so history re-links on accept. Returns the shareable link/URL.
- `GET /api/invites` — list with **status (pending/claimed/expired/revoked)** mapped to email/account.
- `POST /api/invites/:id/revoke` and `/regenerate`.
- `GET /api/invites/accept/:token` — validate token (not expired/consumed) → return the
  pre-fill (guest nickname/email) for the signup form.
- `POST /api/invites/accept/:token` {fullName, nickname, password} → create the `PLAYER` user
  (ACTIVE), **link the originating guest Player** (`Player.userId = newUser.id`), consume the
  token. **If the email already exists → 409 with a "that email is already in use — did you
  forget your password?" message** (don't leak existence beyond the invite context).

**Password resets** (`sendPasswordReset`; copy-paste link, no email — Phase 1 recovery path):
- `POST /api/users/:id/reset-link` → create a `PASSWORD_RESET` token (24h, single-use, hashed),
  return the link.
- `GET /api/resets` — list reset links with **claimed status** + target.
- `GET /api/resets/:token` → validate. `POST /api/resets/:token` {password} → set new
  argon2 hash (policy-validated), consume token, revoke the user's existing sessions.

**Audit log:**
- Write `AuditLog` entries for: invite created, reset issued, user disabled/enabled, role
  changed, permission/group changes, group CRUD. `GET /api/audit` (`viewAll`) — recent entries.

## Conventions to honor

- NestJS modules/guards; `CsrfGuard` on all state-changing routes; `class-validator` DTOs;
  reuse contract enums + the prompt-02 surface. Build `packages/contract` before `nest build`.
- Tokens: store only the hash, compare on redeem, enforce single-use + expiry; reuse the
  prompt-02 token-hash util. Rate-limit invite/reset creation.
- Don't build UI. Don't add email/SMTP.

## Tests (definition of done)

Tests pass (`pnpm test`), lint clean, build green, any migration applies cleanly:
- invite create → accept creates a PLAYER and **links the guest Player** (history carries);
  accepting a consumed/expired token fails; **email-already-in-use returns the 409 message**
- reset create → consume sets a new password, is single-use, and **revokes sessions**
- `includeDisabled` hides DISABLED by default; disable blocks login but keeps the row
- **tier enforcement**: a MANAGER cannot disable/role-change an ADMIN; SUPER_ADMIN can
- permission/group overrides change effective permissions (re-check via resolution)
- audit entries are written for the key actions

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/03-users-admin.md prompts/done/`.
3. Log non-obvious choices (token reuse, invite→guest linking, reset session revocation) in
   `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit (`feat: user management, invites, resets, groups, audit`),
   clean message, **no AI mention**. Stage specific paths, don't push.
5. **Report back**: commit hash + message, endpoints added, and anything prompt 04
   (players/playgroups) should know (esp. the guest-Player linking shape).
