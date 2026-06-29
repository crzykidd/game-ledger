---
name: 31-maintenance-reindex
status: done
created: 2026-06-26
model: sonnet
completed: 2026-06-26
result: >
  Added runMaintenance(kind, actor) to MaintenanceService for on-demand VACUUM/REINDEX via psql
  (args array, no shell injection). Added POST /api/maintenance/run endpoint with RunMaintenanceDto.
  Filled in syncSchedules() stub with reindex cron job registration (maintenance.reindex). Added
  MaintenanceKind type to packages/contract. Added maintenance.reindex to AuditAction union. Added
  13 new unit tests (53 total in maintenance spec). All 241 backend tests pass.
---

# Task: Maintenance — reindex / DB maintenance (VACUUM, ANALYZE, REINDEX)

Fourth slice of issue #5: on-demand and optionally-scheduled database maintenance — `VACUUM
(ANALYZE)` and `REINDEX`. Builds on prompt 28 (module + pg client in image) and prompt 30
(scheduler + `MaintenanceSetting.reindexEnabled`/`reindexCron`).

## Before you start

- Read `CLAUDE.md`. Confirm prompts 28 and 30 landed (`maintenance` module, `MaintenanceSetting`
  with `reindexEnabled`/`reindexCron`, `syncSchedules()` exist).

## Working tree check

`git status --porcelain` clean; list/ask about unexpected dirty files. This file is exempt.

## Codebase facts

- `VACUUM` and `REINDEX` **cannot run inside a transaction block**, so prefer shelling out to `psql`
  (now in the backend image from prompt 28) with `execFile`/`spawn` and an args array, rather than
  Prisma `$executeRaw` (which may wrap statements). Use the same `DATABASE_URL`-via-args approach as
  the backup commands.
- Reuse the prompt-28 controller (class guard `@RequirePermissions(Permission.MANAGE_GLOBAL_SETTINGS)`)
  and prompt-30 `syncSchedules()`/`SchedulerRegistry`.
- Audit union (`backend/src/audit/audit.service.ts`): add `'maintenance.reindex'` (and reuse it or
  add `'maintenance.vacuum'` if you split the two — keep it to one or two clear actions).

## What to do

1. In `maintenance.service.ts`, add `runMaintenance(kind, actor)` where `kind` ∈
   `'vacuum' | 'reindex'` (or a combined `'vacuum_analyze'`):
   - vacuum: `psql -d "<DATABASE_URL>" -c "VACUUM (ANALYZE);"`
   - reindex: `psql -d "<DATABASE_URL>" -c "REINDEX DATABASE gameledger;"`
   Audit `maintenance.reindex` (metadata `{ kind }`). Capture and return a short result summary
   (success + duration); surface stderr on failure as a `BadRequestException`/`InternalServerError`.
2. Controller: `POST /maintenance/run` (`@UseGuards(CsrfGuard)`, `@HttpCode(200)`) taking
   `{ kind }` in the body (validated DTO). Class permission already applies. Reindex/vacuum are not
   as catastrophic as restore, so the class `MANAGE_GLOBAL_SETTINGS` gate is sufficient (no extra
   SUPER_ADMIN gate needed) — but they can be slow, so document that.
3. **Schedule hook**: extend `syncSchedules()` (from prompt 30) so that when `reindexEnabled` &&
   `reindexCron`, a `CronJob` named `maintenance.reindex` runs `runMaintenance('vacuum_analyze',
   systemActor)` (or both vacuum + reindex). Keep the prompt-30 backup job intact.
4. DTO: `RunMaintenanceDto { kind: 'vacuum' | 'reindex' /* or combined */ }`, validated by the global
   pipe (use a `@IsIn([...])` or enum).

## Conventions to honor

- TypeScript; args-array child process (no shell string interpolation of `DATABASE_URL`). Match
  prompt-28 command-runner style (reuse the same private helper that runs pg_dump if you made one).
- Maintenance-kind type usable by the frontend → put it in `packages/contract` if prompt 32 needs it.

## Tests (definition of done)

- Unit tests (mock the command runner + audit):
  - `runMaintenance('vacuum')` and `('reindex')` invoke the expected `psql -c` command and audit
    `maintenance.reindex`.
  - A non-zero exit / stderr is surfaced as an error (not swallowed).
  - `syncSchedules` registers a reindex job when `reindexEnabled` && `reindexCron`, and the
    prompt-30 backup job still registers independently.
- `pnpm test` from `backend/` passes (no live DB; IO mocked).

## When done

1. Update frontmatter; `git mv` to `prompts/done/`.
2. `docs/decisions.md`: note shelling to `psql` for VACUUM/REINDEX (transaction-block constraint),
   and that reindex stays at `MANAGE_GLOBAL_SETTINGS` (not SUPER_ADMIN).
3. **One commit on `dev`** (`feat:`, no AI mention), specific paths only, no push. Report
   hash/files/message and the run endpoint shape for prompt 32.
