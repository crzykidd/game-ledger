---
name: 30-maintenance-scheduling-retention
status: done
created: 2026-06-26
model: sonnet
completed: 2026-06-26
result: >
  Added MaintenanceSetting singleton Prisma model + migration
  (20260627002100_add_maintenance_settings). Installed @nestjs/schedule.
  Implemented getSettings/updateSettings/pruneBackups/syncSchedules in
  MaintenanceService with injected SchedulerRegistryAdapter. Added GET/PUT
  /api/maintenance/settings endpoints. Added MaintenanceSettings and
  UpdateMaintenanceSettingsBody to packages/contract. Wired createBackup to
  call pruneBackups. 15 new unit tests; full suite 228/228. migrate deploy
  verified on fresh DB.
---

# Task: Maintenance — scheduled backups, retention, and settings

Third slice of issue #5: persist maintenance settings (backup schedule + how many backups to keep),
run backups on a cron, and prune old backups to the retention limit. Introduces scheduling infra
(`@nestjs/schedule`). Builds on prompt 28 (and coexists with 29). Prompt 31 (reindex) will reuse the
scheduler this prompt sets up.

## Before you start

- Read `CLAUDE.md` and `docs/data-model.md`. Confirm prompts 28 (and ideally 29) landed.

## Working tree check

`git status --porcelain` should be clean. List/ask about unexpected dirty files. This file is exempt.

## Codebase facts

- `@nestjs/schedule` is **not yet a dependency** and there is no scheduling anywhere — you are
  introducing it. Add `@nestjs/schedule` to `backend/package.json` (pnpm workspace; install so the
  lockfile updates) and register `ScheduleModule.forRoot()` in `backend/src/app.module.ts`.
- Persistence: add a **new singleton model** rather than overloading `GlobalSetting`. Prisma at
  `backend/prisma/schema.prisma`; migrations in `backend/prisma/migrations/` (standard Prisma
  Migrate; both backend containers run `npx prisma migrate deploy` at boot). Create a migration.
- Settings updates are admin-only and CSRF-guarded; reuse the prompt-28 controller (class guard
  `@RequirePermissions(Permission.MANAGE_GLOBAL_SETTINGS)`).
- Audit union (`backend/src/audit/audit.service.ts`): add `'maintenance.settings_updated'` (and use
  the existing `'backup.created'`/`'backup.deleted'` for scheduled runs/pruning).

## What to do

1. **Schema + migration.** Add model `MaintenanceSetting` (table `maintenance_settings`), singleton
   `id Int @id @default(1)`, fields:
   - `backupEnabled Boolean @default(false)`
   - `backupCron String?` (cron expression, e.g. `0 3 * * *`)
   - `backupRetention Int @default(7)` (how many `*.dump` backups to keep; `0`/null = keep all)
   - `reindexEnabled Boolean @default(false)` and `reindexCron String?` (reserved for prompt 31)
   - `createdAt`/`updatedAt` like `GlobalSetting`.
   Create the Prisma migration (`prisma migrate dev --name add_maintenance_settings` against the
   throwaway DB, then verify `migrate deploy` applies cleanly). Commit the generated SQL.
2. **Settings service methods** (in `maintenance.service.ts`):
   - `getSettings()` → upsert/read the singleton (create row 1 with defaults if absent).
   - `updateSettings(dto, actor)` → validate cron strings, persist, audit
     `maintenance.settings_updated`, then **re-sync the scheduler** (step 4).
   - `pruneBackups(retention)` → if retention > 0, delete oldest `*.dump` beyond the limit, auditing
     each `backup.deleted`. Call this after every backup (manual create from prompt 28 should also
     prune — wire `createBackup` to call `pruneBackups` using current settings).
3. **Settings endpoints** (in `maintenance.controller.ts`):
   - `GET /settings` → `getSettings()`.
   - `PUT /settings` (`@UseGuards(CsrfGuard)`) → `updateSettings`.
4. **Dynamic scheduling.** Inject `SchedulerRegistry` (from `@nestjs/schedule`). Implement a
   `syncSchedules()` that removes any existing maintenance cron jobs and, if `backupEnabled` &&
   `backupCron`, registers a `CronJob` named `maintenance.backup` that calls `createBackup(systemActor)`
   then `pruneBackups`. Run `syncSchedules()` on module init (`OnModuleInit`) reading persisted
   settings, and again after `updateSettings`. Use a clearly-identified "system" actor for audit on
   scheduled runs (e.g. `actorUserId: null` with metadata `{ source: 'schedule' }`).
   - Leave a hook (an `if (reindexEnabled && reindexCron) ...`) that prompt 31 will fill in, or expose
     a small extension point so 31 can register its own job without rewriting this method. Keep it
     simple — a single `syncSchedules()` that 31 extends is fine.
5. **DTO**: `UpdateMaintenanceSettingsDto` with validated fields (booleans, optional cron strings,
   retention int ≥ 0). Validate cron syntax (a regex or a tiny helper) and reject invalid input with
   `BadRequestException`.

## Conventions to honor

- TypeScript throughout. Settings types that the frontend needs (prompt 32) should go in
  `packages/contract` (e.g. a `MaintenanceSettings` interface) so the API contract is shared.
- Don't let a bad/empty cron crash boot — guard `syncSchedules()` so a malformed stored cron is
  logged and skipped, not thrown at startup.

## Tests (definition of done)

- Unit tests (mock Prisma + a fake `SchedulerRegistry` + mocked `child_process` for the backup call):
  - `updateSettings` persists and audits `maintenance.settings_updated`, and rejects an invalid cron.
  - `pruneBackups` deletes exactly the oldest-beyond-retention files and audits each deletion; keeps
    all when retention is 0/undefined.
  - `syncSchedules` registers a job when enabled+cron present and registers none when disabled.
- `pnpm test` from `backend/` passes. The migration must `migrate deploy` cleanly on a fresh DB
  (verify against the throwaway DB on port 55432).

## When done

1. Update frontmatter; `git mv` to `prompts/done/`.
2. `docs/decisions.md`: record the dedicated `MaintenanceSetting` model (vs. overloading
   `GlobalSetting`), the dynamic-cron approach, and retention semantics. Update `docs/data-model.md`
   to list the new table.
3. **One commit on `dev`** (`feat:`, no AI mention) — schema+migration, deps/lockfile, service,
   controller, contract type, tests, docs, prompt move. Specific paths only, no push. Report
   hash/files/message and the settings API shape for prompt 32.
