---
name: 01-db-schema
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-25
result: >
  Full M1 schema implemented across 3 migrations. 14 models (User, Session,
  Token, UserPermissionOverride, Group, GroupPermission, UserGroup, AuditLog,
  GlobalSetting, Player, Playgroup, PlaygroupMember, GameModule, Game,
  Participation, GameEvent, ScoreState, GameResult). Contract enums added.
  All 9 tests pass; build/lint clean; migrate deploy from empty verified.
---

# Task: Real Prisma schema + migrations for all M1 entities

Replace the placeholder `SchemaVersion` model with the full M1 data model and generate the
migration. This is schema only — no business logic, endpoints, or UI (those are later prompts).

## Before you start

- Read `CLAUDE.md`, `docs/data-model.md` (entity tiers, the append-only event model),
  `docs/user-management.md` (roles, permissions, tokens, sessions, states), and
  `docs/module-contract.md` (how games reference a module + scoring type).
- The scaffold (prompt 00, commit `b8a6ba6`) wired Prisma → Postgres. Schema lives at
  `backend/prisma/schema.prisma`; migrations in `backend/prisma/migrations/`. Build the
  contract package before `nest build`.

## Working tree check

`git status --porcelain` should show only `prompts/01-db-schema.md`. If anything else is dirty,
list it and ask before proceeding.

## What to do

Model these entities in `schema.prisma` (use sensible Postgres types, FKs, indexes, enums;
`jsonb` for payloads). Names are a guide — match the docs' intent.

**Auth / users**
- `User` — id, email (unique), passwordHash, fullName, nickname, role (enum:
  `SUPER_ADMIN|ADMIN|MANAGER|PLAYER`), state (enum: `PENDING|ACTIVE|DISABLED`), themePref (enum:
  `LIGHT|DARK|SYSTEM`, default SYSTEM), createdAt, updatedAt, lastLoginAt?.
- `Session` — id, userId (FK), createdAt, expiresAt, revokedAt?, plus minimal device/UA info.
- `Token` — **one typed-token table** for invites/resets/shares: id, type (enum:
  `INVITE|PASSWORD_RESET|SHARE`), tokenHash (unique), targetEmail?, targetUserId?, targetGuestPlayerId?,
  targetGameId?, createdById, createdAt, expiresAt, consumedAt?, status (enum:
  `PENDING|CONSUMED|EXPIRED|REVOKED`).
- Permissions model (keep shallow per the docs): a `Permission` enum (createGame,
  configureOwnGame, inviteUsers, sendPasswordReset, manageUsers, manageGroupsRoles,
  manageGlobalSettings, manageGameModules, viewAll); a `UserPermissionOverride`
  (userId, permission, granted) for per-user toggles; a `Group` (id, name) +
  `GroupPermission` (groupId, permission, granted) + `UserGroup` (userId, groupId) join for
  bulk overrides.
- `AuditLog` — id, actorUserId?, action, targetType?, targetId?, metadata (jsonb), createdAt.
- `GlobalSetting` / install state — a way to record that the install wizard has run (e.g. a
  singleton settings row or a `setupCompletedAt`).

**Players / playgroups**
- `Player` — roster entry: id, nickname, optional `userId` (linked account) — null means a
  **guest**; `createdById` (owner roster); createdAt. (A guest becomes linked on invite-accept.)
- `Playgroup` — id, name, createdById, createdAt.
- `PlaygroupMember` — (playgroupId, playerId) join; persists across roster changes.

**Games / scoring**
- `GameModule` — module definitions loaded from YAML: id, version, name, definition (jsonb),
  scoringTypeId, scoringTypeVersion, createdAt. (Unique on (id... use a surrogate key) — keep a
  stable `moduleKey` + version.)
- `Game` — id, moduleKey, moduleVersion, scoringTypeId, scoringTypeVersion, playgroupId? (FK,
  nullable), createdById, status (enum: `ACTIVE|COMPLETE|ABANDONED`), config (jsonb),
  startedAt, endedAt?.
- `Participation` — id, gameId (FK), playerId (FK), seat (int), team? (string/int). Index on
  (gameId), (playerId) for history queries.
- `GameEvent` — **append-only log**: id (bigint), gameId, seq (int), authorPlayerId?, type,
  payload (jsonb), clientEventId (unique), createdAt. **Composite PK or unique (gameId, seq)**;
  unique index on clientEventId.
- `ScoreState` — materialized current score per participation (or per game): gameId,
  participationId, payload (jsonb), updatedAt — derived from events.
- `GameResult` — normalized outcome per participation: id, gameId, participationId, rank?,
  didWin (bool), score? (numeric), normalized (jsonb). This is the stats query surface.

Then:
- Generate the migration (replace the placeholder model; do not keep `SchemaVersion`).
- Add shared enums/types to `packages/contract` (Role, Permission, UserState, ThemePref,
  TokenType, GameStatus, ResultType…) so backend + frontend share them. Keep DB enums and
  contract enums consistent.
- A minimal seed is OK (e.g. nothing user-facing yet) but not required beyond what proves the
  migration.

## Conventions to honor

- Match `CLAUDE.md`. Index the documented hot paths (`Participation` by player/game,
  `GameEvent` by (gameId, seq), `GameResult` by game/participation). `GameEvent` is
  append-only — model it as immutable (no updatedAt).
- Don't add endpoints, services, guards, or UI. Schema + contract types only.

## Tests (definition of done)

- `prisma validate` passes; `prisma migrate dev` applies the new migration cleanly against
  Postgres (and `migrate deploy` works from empty).
- `pnpm --filter @game-ledger/contract build`, then `pnpm build` (backend+frontend) succeed;
  `pnpm lint` clean; `pnpm test` green.
- Add a lightweight test asserting Prisma client + a couple of representative models/relations
  compile and a record round-trips (e.g. create a User + Player + Playgroup against a test DB,
  or at minimum a schema/migration consistency check) — exercise the migration, don't just
  generate it.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/01-db-schema.md prompts/done/`.
3. Log non-obvious modeling choices (enum placement, how permissions resolve, event PK choice,
   ScoreState granularity) in `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit (`feat: M1 data model and migrations` or similar), clean
   Conventional-Commits message, **no AI mention**. Stage only specific paths, don't push.
5. **Report back**: commit hash + message, the final model list, key modeling decisions, and
   anything prompt 02 (auth core) should know (e.g. how sessions/tokens/permissions are shaped).
