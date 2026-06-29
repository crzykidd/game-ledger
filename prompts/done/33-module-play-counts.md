---
name: 33-module-play-counts
status: done
created: 2026-06-27
model: sonnet
completed: 2026-06-27
result: >
  Added playCount: number field to every module object returned by GET /api/modules.
  listModulesWithPlayCounts(userId) added to ModuleLoaderService; controller updated to
  pass CurrentUser. Single groupBy query with versioned-key rollup. 7 new unit tests pass.
  Full backend suite passes. Committed on dev.
---

# Task: Per-user (hosted) play count on /api/modules

Surface, for each game module, how many games **the current user has hosted** (created) with it, so
the Start-New-Game picker can sort games most-played-first. Backend half of the new start-game UX;
the frontend rewrite is prompt 34.

## Before you start

- Read `CLAUDE.md` (stack, conventions, **no AI mention in commits**, one prompt = one commit on
  `dev`). Skim `docs/data-model.md`.

## Working tree check

`git status --porcelain` should be clean. List/ask about unexpected dirty files this plan touches.
This prompt file is exempt.

## Codebase facts (researched — trust these)

- Endpoint: `GET /api/modules` → `backend/src/module-loader/module-loader.controller.ts`
  (`@Controller('modules')`, already `@UseGuards(AuthGuard)`), which returns
  `moduleLoaderService.listModules()` (`backend/src/module-loader/module-loader.service.ts`,
  returns `ModuleDefinition[]` from the in-memory registry).
- `@CurrentUser()` (`backend/src/rbac/current-user.decorator.ts`) gives the caller `User` — already
  usable since AuthGuard is applied.
- `PrismaService` is global (`@Global()`); inject directly.
- **Game model** (`backend/prisma/schema.prisma`, `model Game`): has `moduleKey String`
  (`@map("module_key")`) and `createdById String` (`@map("created_by_id")`). "Hosted by the user" =
  `Game.createdById === user.id`.
- **moduleKey may be versioned**: elsewhere (`games.service.ts`) a `moduleKey` like `skyjo@1` is
  split on `@`; the bare key is the module's `id`. When counting, group by the **base key** (strip
  any `@version`) so all versions of a module roll up to that module's `id`.
- Frontend `ModuleInfo` (`frontend/src/api/play.ts`) is the shape consumed; you're adding a numeric
  field to each module object returned by the endpoint (the frontend type gets updated in prompt 34,
  but keep the field name stable and documented here).
- Tests: Jest, `*.spec.ts` next to source, plain unit style (`new Service(mockPrisma as any)`), no
  `@nestjs/testing`. See `backend/src/module-loader/module-loader.spec.ts` and
  `backend/src/audit/audit.service.spec.ts`.

## What to do

1. Add a method (in `ModuleLoaderService` or the controller — keep it where Prisma access is clean;
   the controller can inject `PrismaService` and compose, or add a service method that takes a
   `userId`) that returns the base list with a **`playCount: number`** field per module = count of
   `Game` rows where `createdById = userId` and the base module key matches `module.id`.
   - Prefer a single grouped query: `prisma.game.groupBy({ by: ['moduleKey'], where: { createdById },
     _count: { _all: true } })`, then fold versioned keys into base keys (`key.split('@')[0]`) and
     map onto each module's `id`. Modules with no hosted games get `playCount: 0`.
2. Wire it into `GET /api/modules`: the controller passes `@CurrentUser() user` and returns the
   modules decorated with `playCount`. Keep the existing fields untouched (additive only).
3. Do NOT sort server-side — return the registry order with counts; the frontend (prompt 34) sorts
   most-played-first then alphabetical. (If trivial you may also sort, but the frontend will sort
   regardless; additive `playCount` is the contract.)

## Conventions to honor

- TypeScript throughout; additive, backward-compatible response change.
- Match module-loader/audit service+controller style and DI.

## Tests (definition of done)

- Unit tests (mock Prisma's `game.groupBy` + the module registry):
  - Each returned module has a `playCount`; a module with N hosted games reports N; a module with
    none reports 0.
  - Versioned `moduleKey`s (`skyjo@1`, `skyjo@2`) roll up to the `skyjo` module's count.
  - Only the current user's hosted games are counted (the `where: { createdById }` filter is applied).
- `pnpm test` from `backend/` passes (isolated throwaway DB per `prompts/startnewsession.md` for the
  full suite; new specs mock Prisma and need no DB). Suite is currently 242/242 + earlier additions.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-27`/`result`); `git mv` to `prompts/done/`.
2. `docs/decisions.md`: note the `playCount` field and "hosted = created_by" definition.
3. **One commit on `dev`** (`feat:`, no AI mention), specific paths only, no push. Report
   hash/files/message and the **exact field name + shape** of the play-count addition for prompt 34.
