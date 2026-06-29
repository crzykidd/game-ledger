---
name: 28-maintenance-backup-restore
status: completed
created: 2026-06-26
model: sonnet            # opus = research/planning, sonnet = coding
completed: 2026-06-26
result: backend/src/maintenance/ module added (service, controller, module); AuditAction extended; pg client in Dockerfiles; backup volume in both compose files; .env.example updated; 16 unit tests pass; 204/204 total tests green
---

# Task: Backend maintenance module — DB backup, restore, download/upload

First slice of Gitea issue #5 ("full task module" / Server Maintenance). Add a backend
`maintenance` module that can create Postgres backups, list them, download one, restore from a
stored backup, and restore from an uploaded file — writing to a configurable backup directory
that can be a local path or an NFS mount through Docker. This prompt also wires the
postgres client tools into the backend image and the backup volume into both compose files.

Later prompts (29 JSON export, 30 scheduling+retention, 31 reindex) build on this module.

## Before you start

- Read `CLAUDE.md` (stack, conventions, **no Claude/AI mention in commits**, one prompt = one
  commit on `dev`) and `docs/spec.md` + `docs/data-model.md` for context.
- Match existing conventions; reuse what prior prompts established (don't re-scaffold).

## Working tree check

Run `git status --porcelain`. The tree should be clean. If any file this plan touches has
uncommitted changes you didn't make, list them and ask before touching. This prompt file is
exempt (it moves per "When done").

## Codebase facts (already researched — trust these)

- **NestJS 10**, global API prefix `api` (`backend/src/main.ts`), so `@Controller('maintenance')`
  serves `/api/maintenance/...`. Every feature module is registered in `backend/src/app.module.ts`
  `imports`.
- **Module shape**: a dir under `backend/src/` with `*.module.ts` / `*.controller.ts` /
  `*.service.ts` / `*.dto.ts` / `*.service.spec.ts`. Model your module on `backend/src/audit/`
  and `backend/src/users/`.
- **RBAC** (`backend/src/rbac/`): guard order is always `@UseGuards(AuthGuard, PermissionsGuard)`
  at class level, with `@RequirePermissions(...)` / `@RequireRole(...)` from
  `backend/src/rbac/require-permissions.decorator.ts`. State-changing routes (POST/PATCH/PUT) add
  per-route `@UseGuards(CsrfGuard)` (CsrfGuard is exported by `RbacModule`). `@CurrentUser()` gives
  the caller `User`. Importing `RbacModule` provides all auth pieces.
- **Permissions/roles** live in `packages/contract/src/index.ts`: `Permission.MANAGE_GLOBAL_SETTINGS`
  (default-granted to SUPER_ADMIN + ADMIN) and `Role.SUPER_ADMIN`.
- **Audit** (`backend/src/audit/audit.service.ts`): inject `AuditService` (via `imports:
  [AuditModule]`) and call `await this.auditService.write({ actorUserId, action, targetType,
  targetId, metadata })`. `action` is a **closed string-literal union** (`AuditAction`, top of the
  file) — you MUST add the new actions to it.
- **Prisma**: `PrismaModule` is `@Global()`; inject `PrismaService` directly. Schema at
  `backend/prisma/schema.prisma`, datasource uses `env("DATABASE_URL")`.
- **Config**: `@nestjs/config` `ConfigModule.forRoot({ isGlobal: true })` is already global; inject
  `ConfigService` and read vars in the constructor with a fallback (see
  `backend/src/invites/invites.service.ts`). `DATABASE_URL` is currently only used by Prisma.
- **Tests**: Jest, `*.spec.ts` next to source, plain unit style — instantiate with
  `new Service(mockPrisma as any, ...)`, no `@nestjs/testing`. ConfigService mock is
  `{ get: () => undefined } as unknown as ConfigService`. See `backend/src/audit/audit.service.spec.ts`.

### Infra facts

- **Postgres `postgres:16-alpine`**, reachable in-network at host `db`, port `5432`, db/user
  `gameledger`, password `${POSTGRES_PASSWORD:-gameledger}`.
- Backend `DATABASE_URL` (both compose files):
  `postgresql://gameledger:${POSTGRES_PASSWORD:-gameledger}@db:5432/gameledger`.
- **Backend images are `node:24-alpine` and do NOT have pg_dump/pg_restore/psql.**
  `backend/Dockerfile` (prod, multi-stage; tools go in the final `runner` stage) and
  `backend/Dockerfile.dev`.
- Compose: `docker-compose.yml` (prod-ish, db uses named volume `db_data`) and
  `docker-compose.dev.yml` (db bind-mounts `./private_data/postgresql`). `private_data/` is
  gitignored and is the established home for persistent host state. `.env.example` is the committed
  env template; real `.env` is untracked.
- nginx proxies `/api/` → `backend:3001` in both `infra/nginx/nginx.conf` and `nginx.dev.conf`.

## What to do

1. **Add the pg client to the backend images.** In `backend/Dockerfile` (final runtime stage) and
   `backend/Dockerfile.dev`, add `RUN apk add --no-cache postgresql16-client` (alongside the
   existing `openssl` line in the dev file). This gives the backend `pg_dump`/`pg_restore`/`psql`
   matching the server major version 16.

2. **Wire the backup volume + env.** The container always uses a fixed backup dir `/backups`; the
   host side is configurable for NFS-or-local.
   - In **both** compose files, add to the `backend` service a volume
     `- ${BACKUP_HOST_DIR:-./private_data/backups}:/backups` and an env var `BACKUP_DIR: /backups`.
   - Add to `.env.example`: `BACKUP_HOST_DIR=./private_data/backups` with a comment that it may be
     an absolute local path or an NFS mountpoint (e.g. `/mnt/nfs/game-ledger-backups`).
   - Ensure the directory is created at runtime by the service if missing (don't rely on the mount
     pre-creating it).

3. **Create `backend/src/maintenance/`**:
   - `maintenance.module.ts` — `@Module({ imports: [RbacModule, AuditModule], controllers:
     [MaintenanceController], providers: [MaintenanceService], exports: [MaintenanceService] })`.
   - `maintenance.service.ts` — inject `PrismaService`, `AuditService`, `ConfigService`. Read the
     backup dir as `this.config.get('BACKUP_DIR') ?? '/backups'` and the connection string as
     `this.config.get('DATABASE_URL') ?? process.env.DATABASE_URL`. Implement:
     - `listBackups()` → array of `{ name, sizeBytes, createdAt }` by reading the backup dir
       (`*.dump` files), newest first.
     - `createBackup(actor)` → run `pg_dump -Fc -d "<DATABASE_URL>" -f <dir>/gameledger-<UTC
       timestamp>.dump` via `child_process` (use `execFile`/`spawn`, NOT a shell string with the
       URL interpolated — pass args as an array to avoid injection/quoting bugs). Audit
       `backup.created`. Return the new backup's metadata.
     - `getBackupPath(name)` → validate `name` against a strict allowlist regex
       (`^gameledger-[0-9TZ:-]+\.dump$`) and ensure the resolved path stays inside the backup dir
       (guard against path traversal); throw `NotFoundException` if missing. Used by the download
       route.
     - `deleteBackup(name, actor)` → same validation, unlink, audit `backup.deleted`.
     - `restoreFromFile(absPath, actor)` → run `pg_restore --clean --if-exists --no-owner
       --no-acl -d "<DATABASE_URL>" <absPath>`. Audit `backup.restored`. (Document the obvious
       caveat in code: restore overwrites current data; that's why the route is SUPER_ADMIN-only.)
     - `restoreFromStored(name, actor)` → resolve via `getBackupPath`, then `restoreFromFile`.
     - `restoreFromUpload(tmpPath, actor)` → `restoreFromFile` then clean up the temp file.
   - `maintenance.controller.ts` — `@Controller('maintenance')`, class-level
     `@UseGuards(AuthGuard, PermissionsGuard)` + `@RequirePermissions(Permission.MANAGE_GLOBAL_SETTINGS)`:
     - `GET /backups` → `listBackups()`.
     - `POST /backups` (`@UseGuards(CsrfGuard)`, `@HttpCode(200)`) → `createBackup`.
     - `GET /backups/:name/download` → stream the file with `Content-Disposition: attachment`
       (use Nest `@Res({ passthrough:false })` with `res.download(...)` or a `StreamableFile`).
     - `DELETE /backups/:name` (`@UseGuards(CsrfGuard)`) → `deleteBackup`.
     - `POST /backups/:name/restore` (`@UseGuards(CsrfGuard)`, `@HttpCode(200)`,
       **`@RequireRole(Role.SUPER_ADMIN)`** in addition to the class permission) → `restoreFromStored`.
     - `POST /restore` (`@UseGuards(CsrfGuard)`, `@HttpCode(200)`, **`@RequireRole(Role.SUPER_ADMIN)`**)
       → accept a multipart upload (`@nestjs/platform-express` `FileInterceptor`, write to a temp
       path) and call `restoreFromUpload`. If multipart adds too much surface, accept the raw dump
       body instead — but keep the SUPER_ADMIN gate and the temp-file cleanup.
   - `maintenance.dto.ts` — any request DTOs you need (validated by the global ValidationPipe).
4. **Register `MaintenanceModule`** in `backend/src/app.module.ts` `imports`.
5. **Extend `AuditAction`** in `backend/src/audit/audit.service.ts` with `'backup.created'`,
   `'backup.deleted'`, `'backup.restored'`.

## Conventions to honor

- Stack/structure per `CLAUDE.md`. TypeScript throughout; shared types in `packages/contract` if a
  type is used by the frontend later (export-shaped response types can live in the controller for
  now and be promoted in prompt 32 if needed).
- **Never build shell strings from `DATABASE_URL` / file names.** Use `execFile`/`spawn` with an
  args array. Validate every user-supplied backup name.
- Match `audit`/`users` module style for decorators, DI, DTOs, and error handling
  (`NotFoundException`, etc.).

## Tests (definition of done)

- `backend/src/maintenance/maintenance.service.spec.ts`, plain unit style. Mock `child_process`
  (e.g. `jest.mock('child_process')` or inject a runner) and `fs` so no real pg/files are touched.
  Cover:
  - `createBackup` invokes the dump command with the expected arg array and audits `backup.created`.
  - `getBackupPath`/`deleteBackup` reject a traversal/invalid name (e.g. `../etc/passwd`,
    `foo.txt`) and accept a valid `gameledger-*.dump` name.
  - `restoreFromStored` audits `backup.restored`; `restoreFromUpload` cleans up its temp file.
  - `listBackups` returns newest-first metadata.
- All backend tests pass: from `backend/`, with a working `DATABASE_URL` (see
  `prompts/startnewsession.md` "How to verify" — isolated throwaway DB on port 55432), run
  `pnpm test`. The new specs should not need a live DB (they mock IO).

## When done

1. Update this file's frontmatter: `status`, `completed` (2026-06-26), `result`.
2. `git mv` this file into `prompts/done/`.
3. Record non-obvious decisions in `docs/decisions.md` (newest at top) — at minimum: pg client in
   the backend image + shelling out vs. dumping from the db container; fixed `/backups` container
   path with host-configurable bind for NFS; SUPER_ADMIN gate on restore.
4. Update `docs/` where it describes admin/ops if such a section exists; otherwise note the new env
   vars near where other env vars are documented (and they're already in `.env.example`).
5. **One commit on `dev`** covering the module, Docker/compose/env wiring, audit change, tests,
   docs, and this prompt's move. Conventional-Commits message (`feat:`), **no AI mention**. Stage
   only specific paths (never `git add -A`), do not push. Then report the hash, files, message, and
   anything prompt 29/30/31/32 should know (e.g. exact endpoint paths + response shapes).
