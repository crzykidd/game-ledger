---
name: 11-debug-ports-optin
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: >
  Removed host ports from db/backend/frontend in docker-compose.dev.yml so a plain `up`
  publishes only the nginx ingress (DEV_APP_PORT 8088). Created docker-compose.dev.debug.yml
  thin override that re-adds DEV_FRONTEND_PORT/DEV_BACKEND_PORT/DEV_DB_PORT. Updated README
  and .env.example with default vs debug commands. Verified live: default stack publishes
  only 0.0.0.0:8088->80/tcp, SPA returns 200, /api/health returns {"status":"ok"}, 5173 not
  on host. Debug stack verified with DEV_BACKEND_PORT=3091 (3001 was in use on the host);
  db/frontend/nginx all published. Both `config` outputs valid. Logged in docs/decisions.md.
---

# Task: Make the dev debug ports opt-in (default dev = nginx ingress only)

A plain `docker compose -f docker-compose.dev.yml up` should publish **only the nginx ingress**
(`DEV_APP_PORT`, default 8088). The direct db/backend/Vite ports become **opt-in** via a Compose
override file, so a homelab box with stuff on 5432/3001/5173 has zero collisions by default.

## Before you start

- Read `CLAUDE.md`. Latest commit `ae41979` added the dev nginx ingress (`infra/nginx/nginx.dev.conf`,
  `DEV_APP_PORT`, HMR via `VITE_HMR_CLIENT_PORT`). Docker is available — verify by bringing the
  stack up.
- Note: db/backend/frontend talk to each other on the Compose network **by service name**, so
  **un-publishing their host ports does not break internal routing or HMR** (the browser reaches
  Vite's HMR websocket through nginx on `DEV_APP_PORT`, which proxies to `frontend:5173` internally).

## Working tree check

`git status --porcelain` should show only `prompts/11-debug-ports-optin.md`. Otherwise list and ask.

## What to do

**1. `docker-compose.dev.yml` (base)** — remove the host `ports:` mappings from `db`, `backend`,
and `frontend` so they're internal-only. **Keep** the `nginx` service publishing
`"${DEV_APP_PORT:-8088}:80"`. Leave volumes, env (incl. `VITE_HMR_CLIENT_PORT`), `depends_on`,
healthchecks unchanged. Result: a plain `up` publishes exactly one host port (the ingress).

**2. New `docker-compose.dev.debug.yml` (override)** — re-adds the direct debug ports:
- `frontend`: `"${DEV_FRONTEND_PORT:-5173}:5173"`
- `backend`: `"${DEV_BACKEND_PORT:-3001}:3001"`
- `db`: `"${DEV_DB_PORT:-5432}:5432"`
Only the `ports:` keys — it's a thin override merged on top of the base.

**3. Docs** — update `README.md` and `.env.example`:
- **Default dev:** `docker compose -f docker-compose.dev.yml up --build` → only nginx on
  `DEV_APP_PORT` (8088). The normal way in.
- **Debug (direct ports):**
  `docker compose -f docker-compose.dev.yml -f docker-compose.dev.debug.yml up --build`
  → also publishes Vite/backend/db (each overridable via `DEV_*_PORT`).
- Make clear the debug ports are opt-in and only needed for direct DB/backend/Vite access.

## Conventions to honor

- No app-code or behavior changes; compose + docs only. Don't touch the prod compose or the
  nginx configs. HMR must still work through the ingress in the default (no-override) case.

## Verify (definition of done)

- `docker compose -f docker-compose.dev.yml config` validates; the merged
  `-f docker-compose.dev.yml -f docker-compose.dev.debug.yml config` validates and shows the
  extra ports.
- **Default stack up** (`-f docker-compose.dev.yml` only): confirm **only one host port is
  published** (the ingress) — e.g. via `docker compose ... ps`. Confirm through it:
  `http://localhost:${DEV_APP_PORT}/` loads the SPA and `/api/health` → `{"status":"ok"}`, and
  HMR still connects (no published 5173). Use a free `DEV_APP_PORT` if 8088 collides here and say
  which.
- **Override stack up**: confirm the direct db/backend/Vite ports are now also published.
- Tear down after. If full bring-up isn't possible here, say so and verify both `config`
  outputs + `ps` port lists instead — don't fake it.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/11-debug-ports-optin.md prompts/done/`.
3. Log the base+override approach in `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit (`chore: make dev debug ports opt-in via compose override`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing —
   do not stall at the commit step.
5. **Report back**: commit hash + message, the default vs debug `up` commands, and confirmation
   that the default stack publishes only the ingress port (with HMR still working).
