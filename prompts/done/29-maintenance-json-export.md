---
name: 29-maintenance-json-export
status: done
created: 2026-06-26
model: sonnet
completed: 2026-06-26
result: >
  Added GET /api/maintenance/export to MaintenanceService + MaintenanceController.
  Exports 15 domain tables as a JSON snapshot (secrets stripped: passwordHash/failedLoginAttempts/lockedUntil
  from User rows; Session and Token tables excluded). BigInt (GameEvent.id) and Decimal (GameResult.score)
  serialized to strings. Audits export.generated with rowCounts. 9 new unit tests; full suite 213/213 green.
---

# Task: Maintenance — export all entries as JSON

Second slice of issue #5. Add a `GET /api/maintenance/export` endpoint that streams a JSON
snapshot of all domain data (games, events, scores, results, players, playgroups, modules, plus
non-secret user/group structure) as a downloadable file. Builds on the `maintenance` module from
prompt 28 (must be merged first).

## Before you start

- Read `CLAUDE.md` and `docs/data-model.md`. Confirm prompt 28 landed (`backend/src/maintenance/`
  exists, registered in `app.module.ts`).

## Working tree check

`git status --porcelain` should be clean. List + ask about any unexpected dirty files this plan
touches. This prompt file is exempt.

## Codebase facts

- Add to the existing `maintenance` module/controller/service from prompt 28 — don't create a new
  module. Class guard is already `@RequirePermissions(Permission.MANAGE_GLOBAL_SETTINGS)`.
- `PrismaService` is injected (global). All models are in `backend/prisma/schema.prisma`.
- Audit: extend the `AuditAction` union (`backend/src/audit/audit.service.ts`) with
  `'export.generated'` and call `auditService.write` from the export handler.

### Models to export (domain data) and serialization caveats

Export these tables (read all rows via Prisma): `Game`, `Participation`, `GameEvent`, `ScoreState`,
`GameResult`, `Player`, `Playgroup`, `PlaygroupMember`, `GameModule`, `Group`, `GroupPermission`,
`UserGroup`, `AuditLog`. Also export `User` and `UserPermissionOverride` **with secrets stripped**.

- **Strip secrets**: never emit `User.passwordHash` (and any reset/login-token fields), `Session`
  rows entirely (skip the table), and `Token` hash values (skip the `Token` table, or include only
  non-secret metadata — simplest: skip `Token` and `Session` entirely).
- **BigInt**: `GameEvent.id` is `BigInt` — JSON.stringify throws on BigInt. Serialize BigInt → string.
- **Decimal**: `GameResult.score` is `Decimal(12,4)` — serialize via `.toString()` (Prisma Decimal)
  to avoid precision loss.
- **Json columns** (`payload`, `definition`, `config`, `metadata`, `normalized`) pass through as-is.

## What to do

1. In `maintenance.service.ts`, add `exportAll(actor)` that reads the tables above, assembles an
   object `{ exportedAt, version, tables: { games: [...], game_events: [...], ... } }`, applies the
   secret-stripping and BigInt/Decimal serialization, audits `export.generated` (metadata: row
   counts per table), and returns the object (or a JSON string).
   - Use a BigInt-safe serializer: either map rows to plain objects first, or pass a `JSON.stringify`
     replacer that converts `bigint` → `String(value)` and Prisma `Decimal` → `.toString()`.
2. In `maintenance.controller.ts`, add `GET /export` (class permission already applies) that returns
   the JSON as a download: set `Content-Type: application/json` and
   `Content-Disposition: attachment; filename="game-ledger-export-<UTC timestamp>.json"`. For large
   data prefer a `StreamableFile`/streamed response over buffering the whole string if it's
   straightforward; buffering is acceptable for v1 — note the tradeoff in a code comment.
3. Extend `AuditAction` with `'export.generated'`.

## Conventions to honor

- TypeScript throughout; reuse the prompt-28 module. Match controller/service style.
- Deterministic, secret-free output. Double-check no password hash or session/token secret can
  appear in the payload.

## Tests (definition of done)

- Extend `backend/src/maintenance/maintenance.service.spec.ts` (or add cases):
  - `exportAll` includes the expected table keys and **omits** `passwordHash`/sessions/token secrets.
  - BigInt and Decimal values serialize to strings without throwing (feed mock rows containing a
    `BigInt` id and a Decimal-like score; assert `JSON.stringify` of the result succeeds and the
    values are strings).
  - `export.generated` is audited.
- `pnpm test` from `backend/` passes (specs mock Prisma; no live DB needed).

## When done

1. Update frontmatter (`status`/`completed: 2026-06-26`/`result`); `git mv` to `prompts/done/`.
2. Record any non-obvious decision in `docs/decisions.md` (e.g. which tables/secrets are excluded
   and why; buffer-vs-stream choice).
3. **One commit on `dev`** (`feat:`, no AI mention), specific paths only, no push. Report
   hash/files/message and the export endpoint's exact shape for prompt 32.
