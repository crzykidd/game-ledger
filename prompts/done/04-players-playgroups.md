---
name: 04-players-playgroups
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: >
  Implemented players (roster + guest CRUD) and playgroups (CRUD + membership) backend API.
  9 endpoints added. 14 tests added, all passing. Lint clean, build green.
  Nickname uniqueness is per-playgroup (not global). Decision logged in docs/decisions.md.
---

# Task: Players (roster + guests) and playgroups (backend)

Build the roster + playgroup API: creating/listing players (registered or guest), and the
recurring-friend-group playgroups that games draw a subset from. **Backend only** — UI is a
later prompt.

## Before you start

- Read `CLAUDE.md`, `docs/spec.md` (Users/players/guests + Playgroups sections), and the
  prompt-03 report: `Player` is the stable identity anchor — `Player.userId == null` is a guest,
  non-null is a linked registered user. Guests are owned by their creator's roster.
- Built already: `Player`, `Playgroup`, `PlaygroupMember` models; the auth/RBAC surface
  (`AuthGuard`, `CsrfGuard`, `@RequirePermissions`, `@CurrentUser`, `PermissionService`,
  `canActOn`). Permissions of note: `createGame`, `manageUsers`, `viewAll`.

## Working tree check

`git status --porcelain` should show only `prompts/04-players-playgroups.md`. Otherwise list and ask.

## What to do

**Players / roster**
- `POST /api/players` {nickname} → create a **guest** Player owned by the caller
  (`createdById = current user`). (Registered-user Players are created via invite-accept in
  prompt 03 — don't duplicate that.)
- `GET /api/players` → the caller's roster (players they created) + themselves; managers/`viewAll`
  can list all. Each entry indicates guest vs. linked user (include the linked user's nickname).
- `GET /api/players/:id` → detail.
- `PATCH /api/players/:id` {nickname} → rename a guest in your roster (not someone else's
  linked account).
- Decide + document **nickname uniqueness** scope (recommend: unique within a playgroup, not
  global — see open decision in docs). Don't over-enforce globally.

**Playgroups**
- `POST /api/playgroups` {name, optional initial memberPlayerIds} → create, `createdById = caller`.
- `GET /api/playgroups` → playgroups the caller belongs to or created; `viewAll` sees all.
- `GET /api/playgroups/:id` → detail incl. members (players, guest or registered).
- `PATCH /api/playgroups/:id` {name} → rename (owner or `manageUsers`/`viewAll`).
- **Membership:** `PUT /api/playgroups/:id/members` (set) or
  `POST`/`DELETE /api/playgroups/:id/members/:playerId` (add/remove). Members can be **guests or
  registered**. The group **persists across roster changes** (removing a member doesn't delete
  history). Only the owner (or `manageUsers`/`viewAll`) manages membership.

## Conventions to honor

- NestJS modules/guards; `CsrfGuard` on mutations; `class-validator` DTOs; reuse contract enums
  + the prompt-02/03 surface. Build `packages/contract` before `nest build`.
- A `Player` is the identity anchor; queries handle guest + registered uniformly (the linked
  `User` is optional metadata). Don't build game/scoring logic (prompt 05) or UI (prompt 07).
- Ownership/authorization: a caller manages their own roster + the playgroups they own; elevated
  perms (`manageUsers`/`viewAll`) can manage across. Enforce it.

## Tests (definition of done)

Tests pass (`pnpm test`), lint clean, build green:
- create a guest Player owned by the caller; it appears in their roster, not others' (unless `viewAll`)
- rename a guest you own; cannot rename a Player you don't own / a linked account
- create a playgroup; add both a guest and a registered Player as members; list shows both
- remove a member — the playgroup + (later) history references remain intact (membership row
  removed, Player row untouched)
- non-owner without elevated perms cannot modify another's playgroup membership

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/04-players-playgroups.md prompts/done/`.
3. Log non-obvious choices (nickname-uniqueness scope, ownership rules, membership set vs
   add/remove) in `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit (`feat: players, guests, and playgroups`), clean message,
   **no AI mention**. Stage specific paths, don't push.
5. **Report back**: commit hash + message, endpoints added, and anything prompt 05 (game engine)
   needs about how games attach to a playgroup + reference participants (players).
