---
name: 02-auth-core
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-25
result: >
  Auth core implemented: install wizard (GET /api/setup/status, POST /api/setup),
  email/password login with httpOnly/Secure/SameSite session cookies and SHA-256
  hashed tokens at rest, logout + logout-all, /api/auth/me with effective permissions,
  argon2id password hashing + policy validator, double-submit CSRF protection, per-account
  brute-force lockout (5 failures → 15 min), and the RBAC guard layer (AuthGuard,
  PermissionsGuard + RequirePermissions/RequireRole decorators, PermissionService, canActOn
  tier-rule helper). Two schema migrations added. 53 tests, lint clean, build green.
---

# Task: Auth core + RBAC (backend)

Build the backend authentication core: install wizard, email/password login, server-side
sessions, password hashing + policy, CSRF, brute-force protection, and the RBAC guard layer.
**Backend only** — the install-wizard/login UI is a later frontend prompt. **No invites,
password-reset links, or user-management CRUD** — those are prompt 03.

## Before you start

- Read `CLAUDE.md` and `docs/user-management.md` (roles, sessions, password policy, brute-force,
  install wizard, permission resolution order).
- Schema is committed (prompt 01, `ff74d43`). Relevant: `User`, `Session`, `GlobalSetting`,
  `UserPermissionOverride`, `Group`/`GroupPermission`/`UserGroup`; contract has `Role`,
  `Permission`, `UserState`, `ROLE_DEFAULT_PERMISSIONS`.

## Working tree check

`git status --porcelain` should show only `prompts/02-auth-core.md`. Otherwise list and ask.

## What to do

**Install wizard (one-time)**
- `GET /api/setup/status` → whether setup is complete (`GlobalSetting` id=1 `setupCompletedAt`).
- `POST /api/setup` → if not yet complete, create the first user as `SUPER_ADMIN` (state ACTIVE)
  from {fullName, nickname, email, password}, set `setupCompletedAt`. **Guard so it can never
  run again** once a SUPER_ADMIN/setup exists.

**Auth**
- `POST /api/auth/login` {email, password} → verify, create a `Session`, set an **httpOnly,
  Secure, SameSite** session cookie. Store a **hashed** session token at rest (add a
  `tokenHash` column to `Session` if needed; the cookie carries the raw token, DB stores its
  hash). Update `lastLoginAt`.
- `POST /api/auth/logout` → revoke current session. `POST /api/auth/logout-all` → revoke all of
  the user's sessions.
- `GET /api/auth/me` → current user (id, email, nickname, fullName, role, state, themePref,
  effective permissions). 401 if no valid session.

**Password handling**
- Hash with **argon2id** (or bcrypt) at the service layer. Never store plaintext.
- A reusable **password-policy** validator: ≥10 chars, ≥1 upper, ≥1 lower, ≥1 digit. (A zxcvbn
  strength check is a nice-to-have; at least leave a clear hook.)

**Sessions & security**
- Session lifetime + a "remember me"-friendly default (pick a sane value, document it).
  Expired/revoked sessions are rejected. A guard resolves the session cookie → current user.
- **CSRF protection** for cookie-based auth (e.g. double-submit token or SameSite + CSRF token
  on mutations).
- **Brute-force protection** on login: rate-limit + lockout/backoff after repeated failures
  (per account and/or IP). Apply the same throttle to setup.

**RBAC layer**
- An **auth guard** (requires a valid session) and a **permissions guard** + decorator
  (`@RequirePermissions(...)` / `@RequireRole(...)`).
- A **permission-resolution service**: effective permissions = `ROLE_DEFAULT_PERMISSIONS[role]`
  → apply `GroupPermission` (via `UserGroup`) → apply `UserPermissionOverride`. Grants and
  denials both honored (override `granted` boolean wins). Expose effective perms on `/me`.
- Enforce the account-management tier rule helper (who can act on whom: only SUPER_ADMIN manages
  ADMINs; nobody manages a tier ≥ their own) as a reusable check for prompt 03 to consume.

## Conventions to honor

- NestJS modules/providers/guards; `class-validator` DTOs; config via env (session secret,
  cookie flags, lifetimes). Reuse contract enums. Build `packages/contract` before `nest build`.
- Keep endpoints to setup + auth + me. Don't build user CRUD, invites, or resets (prompt 03).

## Tests (definition of done)

Unit/integration tests that pass (`pnpm test`), `pnpm lint` clean, `pnpm build` green, migration
(if you added the `tokenHash` column) applies cleanly:
- password hash + verify; password-policy validator (accept/reject cases)
- permission resolution: role default, group override, per-user override (grant AND deny)
- session lifecycle: create, reject expired, reject revoked, logout-all revokes all
- login: success, wrong password, and **lockout after N failures**
- install wizard: creates first SUPER_ADMIN, and is **blocked on a second call**
- the tier-rule helper (e.g. MANAGER cannot act on an ADMIN; SUPER_ADMIN can)

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/02-auth-core.md prompts/done/`.
3. Log non-obvious choices (session-token storage, CSRF approach, lockout policy, session
   lifetime) in `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit (`feat: auth core, sessions, and RBAC`), clean
   Conventional-Commits message, **no AI mention**. Stage specific paths, don't push.
5. **Report back**: commit hash + message, the endpoints added, the guard/permission API
   surface (so prompt 03 can build user-management on it), and key security choices.
