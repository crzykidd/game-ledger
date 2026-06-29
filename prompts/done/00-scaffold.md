---
name: 00-scaffold
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: Monorepo skeleton created with NestJS+Prisma backend, React+Vite frontend, shared contract package, nginx config, and two docker-compose files; all lint/test/build checks pass and dev Docker stack is verified running.
---

# Task: Scaffold the monorepo into a running skeleton

Stand up the empty-but-running project structure that every later prompt builds on. **No
product features** — just a clean, buildable, testable skeleton with the toolchain wired.

## Before you start

- Read `CLAUDE.md` (stack, conventions, commit rules) and skim `docs/spec.md` (deployment
  topology) + `docs/data-model.md` (so the backend/db wiring matches the intended design).
- This is the first code in the repo — you are creating the structure, not fitting into one.

## Working tree check

Run `git status --porcelain`. Expect only `prompts/00-scaffold.md` (this file) as new/modified.
If anything else is dirty, list it and ask before proceeding.

## What to do

Create a **pnpm monorepo** with this layout and a working dev toolchain:

```
package.json                # root, private; scripts to run/build/lint/test workspaces
pnpm-workspace.yaml         # backend, frontend, packages/*
tsconfig.base.json          # shared strict TS config
.nvmrc / .editorconfig / .gitignore (Node)   # gitignore must cover node_modules, dist, .env
.env.example                # DATABASE_URL, app port, session secret placeholder, etc.
docker-compose.yml          # prod-ish: db + backend + nginx (serves built frontend, proxies /api)
docker-compose.dev.yml      # dev: postgres (port exposed) + backend (hot reload) + frontend (vite)
infra/nginx/                # nginx config for the prod ingress (serve SPA, proxy /api -> backend)

backend/                    # NestJS + Prisma
  src/main.ts, src/app.module.ts
  a health module: GET /api/health -> { status: "ok" }
  prisma/schema.prisma      # datasource postgres via env; ONE trivial model is fine for now
  Dockerfile, Dockerfile.dev
  one passing unit test (e.g. health controller)

frontend/                   # React + Vite + TypeScript (SPA)
  index.html, vite.config.ts (dev proxy /api -> backend), src/main.tsx, src/App.tsx
  App renders a simple page that calls /api/health and shows the result
  Dockerfile (build static), Dockerfile.dev (vite dev server)

packages/contract/          # shared TS types + JSON Schemas (placeholder for now)
  src/index.ts (export a placeholder type), package.json, tsconfig

modules/                    # YAML game modules (placeholder README; Skyjo comes later)
  README.md
```

Toolchain (root-level where it makes sense):
- **pnpm** workspaces; pin Node in `.nvmrc`.
- **TypeScript strict** everywhere; `tsconfig.base.json` extended by each package.
- **ESLint + Prettier** configured and passing across the repo.
- **Tests:** backend uses NestJS's default (Jest) **or** Vitest — pick one, wire `pnpm test`.
- Root scripts: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test` that fan out to workspaces.

Wiring:
- Backend reads `DATABASE_URL` from env; Prisma connects to the Postgres service. Run
  `prisma generate` + an initial `prisma migrate` (the single placeholder model) so the
  migration flow is proven.
- Frontend dev calls `/api/health` via the Vite proxy to the backend.
- `docker-compose.dev.yml` must bring up postgres + backend + frontend for local dev.
- `docker-compose.yml` is the prod-ish topology (prebuilt nginx serving the built SPA and
  proxying `/api` to the backend, backend + db not directly exposed) per `docs/spec.md`.

## Conventions to honor

- Match `CLAUDE.md`. TypeScript throughout. Keep the skeleton minimal — resist adding auth,
  entities, or UI beyond the health check; those are later prompts.
- Shared types belong in `packages/contract` (even if just a placeholder now).

## Tests (definition of done)

- `pnpm install` succeeds; `pnpm lint` clean; `pnpm test` green (at least the one backend test).
- `pnpm build` builds backend + frontend.
- `prisma migrate` runs cleanly against Postgres.
- `docker compose -f docker-compose.dev.yml config` (and the prod file) validate.
- **Verify the dev stack actually runs if Docker is available** (health endpoint reachable,
  frontend shows the health result). **If Docker is not available in this environment, say so
  explicitly** and confirm the apps run via `pnpm dev` instead — don't fake it.

## When done

1. Update this file's frontmatter: `status`, `completed` (2026-06-24), `result` (one line).
2. `git mv prompts/00-scaffold.md prompts/done/`.
3. Record any non-obvious choices (test runner, ORM details, dev-proxy vs nginx-in-dev, etc.)
   in `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit: the scaffold + tests + this prompt's move. Conventional
   message (e.g. `chore: scaffold monorepo skeleton`), **no Claude/AI mention, no
   `Co-authored-by`/`Claude-Session`**. Stage only the new/changed paths (never `git add -A`),
   do not push.
5. **Report back**: the commit hash + message, the final directory layout, the test runner and
   key choices you made, whether the Docker dev stack came up, and anything prompt 01 (DB schema)
   should know about how Prisma/migrations are wired.
