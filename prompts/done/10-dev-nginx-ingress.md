---
name: 10-dev-nginx-ingress
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: >
  nginx ingress added to dev stack on DEV_APP_PORT (default 8088). Prod nginx moved
  off port 80 to APP_PORT (default 8080). infra/nginx/nginx.dev.conf written with HMR
  websocket proxy. VITE_HMR_CLIENT_PORT env var wires Vite HMR client back through nginx.
  backend/Dockerfile.dev updated to install openssl and run prisma generate + migrate deploy
  at container start (pre-existing Alpine/libssl1.1 incompatibility fixed). Both compose
  configs validate. Verified: GET / → 200 HTML, GET /api/health → {"status":"ok"},
  HMR port 8088 confirmed in @vite/client (hmrPort = 8088). Stack torn down after verify.
---

# Task: nginx ingress in dev + move both stacks off port 80

Make **nginx the primary way in for the dev stack** (so dev exercises the real ingress path, not
just Vite directly), keep the Vite/backend/db ports as **overridable debug fallbacks**, and
change **both** compose stacks so they **do not default to port 80** (this is a homelab app).

## Before you start

- Read `CLAUDE.md`. The app is built through M1 (latest `452c2f4`). Docker is available — you
  must bring the dev stack up and verify routing through nginx.
- Current state: `docker-compose.yml` (prod) exposes only nginx on `${APP_PORT:-80}`;
  `docker-compose.dev.yml` has **no nginx** — it publishes frontend (Vite :5173), backend (:3001),
  db (:5432) directly, and the frontend talks to the backend via Vite's `/api` proxy.

## Working tree check

`git status --porcelain` should show only `prompts/10-dev-nginx-ingress.md`. Otherwise list and ask.

## What to do

**1. Prod compose (`docker-compose.yml`)** — change the nginx published port default off 80:
`"${APP_PORT:-8080}:80"`. (Still only nginx is published; db/backend stay internal.)

**2. Dev compose (`docker-compose.dev.yml`)** — add an nginx ingress and parameterize ports:
- Add an `nginx` service using the **official `nginx:alpine` image** (no build) with a mounted
  **dev** config (new file below). Publish it on `"${DEV_APP_PORT:-8088}:80"`. `depends_on`
  frontend + backend. **This is the normal way in for dev.**
- Make the existing published ports **env-overridable**, keeping them as fallback debug access:
  `"${DEV_FRONTEND_PORT:-5173}:5173"`, `"${DEV_BACKEND_PORT:-3001}:3001"`,
  `"${DEV_DB_PORT:-5432}:5432"`.

**3. Dev nginx config** — `infra/nginx/nginx.dev.conf` (mounted into the dev nginx service):
- Proxy `/api` → the backend service (`backend:3001`).
- Proxy `/` → the Vite dev server (`frontend:5173`), **including HMR websocket upgrade**
  (`Upgrade`/`Connection` headers, `proxy_http_version 1.1`). Vite's HMR client must work through
  the nginx port — set Vite's `server.hmr.clientPort` (and `host`/`allowedHosts` as needed) so
  HMR connects back through `DEV_APP_PORT`, or configure nginx so the default HMR websocket path
  is proxied. Whichever you choose, **verify HMR actually connects** through nginx.
- Keep the prod `infra/nginx/nginx.conf` as-is (it serves the built SPA + proxies /api).

**4. Docs** — update `.env.example` and `README.md`:
- Document `APP_PORT` (prod, default 8080), `DEV_APP_PORT` (dev ingress, default 8088), and the
  fallback `DEV_FRONTEND_PORT`/`DEV_BACKEND_PORT`/`DEV_DB_PORT`.
- State that **nginx is the primary entry for both stacks** (dev via `DEV_APP_PORT`), the
  direct Vite/backend/db ports are debug fallbacks, and **neither stack uses port 80**.

## Conventions to honor

- Don't change app code or the prod nginx behavior beyond the port default. Keep dev hot-reload
  working (volume mounts unchanged). Everything stays env-overridable so collisions are trivial
  to dodge.

## Verify (definition of done)

- `docker compose -f docker-compose.dev.yml config` and `docker compose -f docker-compose.yml
  config` both validate.
- Bring the **dev** stack up (pick free ports via the env vars if 8088/5173/3001/5432 collide in
  this env, and say which you used). Confirm **through the nginx ingress port**:
  - the app/SPA loads at `http://localhost:${DEV_APP_PORT}`
  - `GET http://localhost:${DEV_APP_PORT}/api/health` → `{"status":"ok"}`
  - HMR connects (note how you verified). If Docker/ports make full bring-up impossible here, say
    so explicitly and verify config + nginx conf syntax (`nginx -t`) instead — don't fake it.
- Tear the stack down afterward.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/10-dev-nginx-ingress.md prompts/done/`.
3. Log choices (HMR-through-nginx approach, chosen default ports) in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`chore: add nginx ingress to dev stack and move off port 80`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing —
   do not stall at the commit step.
5. **Report back**: commit hash + message, the dev `up` command + the URL/port the app is reachable
   on, how HMR-through-nginx was handled and verified, and the new env vars.
