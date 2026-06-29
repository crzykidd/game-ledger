# game-ledger

A self-hosted, mobile-first app for tracking game scores over time.

[![CI](https://github.com/crzykidd/game-ledger/actions/workflows/ci.yml/badge.svg)](https://github.com/crzykidd/game-ledger/actions/workflows/ci.yml)
[![Latest Release](https://img.shields.io/github/v/release/crzykidd/game-ledger)](https://github.com/crzykidd/game-ledger/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Status: pre-release / in active development.** Not yet at a stable v1.0 — expect
> breaking changes between releases. See [`docs/`](docs/) for the full design.

## Features

- **Pluggable game modules** — each game is a self-contained YAML definition (plus optional
  code for custom UI). Adding a new game does not touch the core. Ships with 18 modules,
  including a live SVG **Cribbage** peg board.
- **Released vs pre-release games** — the game picker shows stable ("released") games by
  default, with a toggle to reveal in-development ("pre-release") ones.
- **Players, guests, and playgroups** — registered users plus ad-hoc guest names; recurring
  friend groups with persistent history and group-level leaderboards.
- **Invite-only local auth** — no open signup; Super Admin creates invites; role tiers
  (Super Admin / Admin / Manager / Player / Guest) with per-user permission overrides.
- **Admin controls** — user management (invite, reset password, disable), playgroup
  management, and a Server Maintenance page (DB backup / restore / JSON export, scheduled
  VACUUM/REINDEX).
- **Server-side autosave** — every score change is persisted immediately; resume any
  in-progress game on any device.

## Tech stack

pnpm monorepo:

| Layer | Technology |
|---|---|
| Backend | NestJS + Prisma + PostgreSQL |
| Frontend | React + Vite + TypeScript (SPA) |
| Shared types | `packages/contract` — TS interfaces + JSON Schemas |
| Game modules | `modules/` — YAML definitions validated at boot |
| Ingress | nginx (prebuilt, config-only) |
| Deployment | Docker Compose |

## Installation (self-hosted with Docker Compose)

game-ledger runs as a small Compose stack — **nginx** (the only published port) →
**backend** (NestJS API) → **PostgreSQL**. The backend applies database migrations
automatically on startup, so there's no manual migration step.

### Prerequisites

- **Docker Engine** + **Docker Compose v2** (the `docker compose` subcommand).
- ~1 GB of disk for images plus space for your database and backups.

### 1. Get the code

```bash
git clone https://github.com/crzykidd/game-ledger.git
cd game-ledger
```

### 2. Configure

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

Before exposing the app, set a strong **`SESSION_SECRET`** and **`POSTGRES_PASSWORD`**.
The most important variables:

| Variable | Default | Purpose |
|---|---|---|
| `SESSION_SECRET` | `change-me-in-production` | **Required** — secret for session cookies. Use a long random value (e.g. `openssl rand -hex 32`). |
| `POSTGRES_PASSWORD` | `gameledger` | Database password (shared by the `db` and `backend` services). |
| `APP_PORT` | `8080` | Host port nginx (the app) listens on. |
| `BACKUP_HOST_DIR` | `./private_data/backups` | Host path for DB backups, bind-mounted to `/backups`. A local path or an NFS mountpoint. |

See [`.env.example`](.env.example) for the full list (including dev-only ports).

### 3. Start

```bash
docker compose up -d --build
```

This builds the backend and frontend images, starts PostgreSQL, applies migrations, and
brings up nginx. The first build takes a few minutes.

### 4. First-run setup

Open **`http://localhost:8080`** (or your host / `APP_PORT`). The **install wizard** walks
you through creating the first **Super Admin** account. After that, sign in and invite other
users from **Admin → Users** — there is no open signup.

### Data & backups

- **Database** lives in the `db_data` Docker named volume. It survives `docker compose down`
  and is only removed by `docker compose down -v`.
- **Backups** (DB dump/restore + JSON export, optional scheduled maintenance) are managed
  from the **Admin → Server Maintenance** page and written to `BACKUP_HOST_DIR`.

### Updating

```bash
git pull
docker compose up -d --build   # rebuilds images; migrations re-apply automatically
```

### Stopping

```bash
docker compose down            # stop containers, keep your data
# docker compose down -v       # ALSO deletes the database volume — destroys all data
```

### Prebuilt images (optional)

Container images are published to GitHub Container Registry on every push to `main`/`dev`:

- `ghcr.io/crzykidd/game-ledger-backend`
- `ghcr.io/crzykidd/game-ledger-frontend`

The default Compose file builds from source; an image-tag-based deployment option lands with
the first tagged release.

## Development

Hot-reload dev stack (source bind-mounted):

```bash
docker compose -f docker-compose.dev.yml up --build
```

Served at **`http://localhost:8088`** (`DEV_APP_PORT` to override). Optional direct
Vite / API / Postgres ports are available via the `docker-compose.dev.debug.yml` overlay.
Test/verify instructions live in `prompts/startnewsession.md`.

## Documentation

Full design docs live in [`docs/`](docs/):

- [`docs/spec.md`](docs/spec.md) — concept, deployment topology, module system, offline design
- [`docs/module-contract.md`](docs/module-contract.md) — game-module contract (scoring types, UI tiers)
- [`docs/data-model.md`](docs/data-model.md) — database structure
- [`docs/user-management.md`](docs/user-management.md) — auth, roles, invites
- [`docs/games/catalog.md`](docs/games/catalog.md) — scoring models for every included game
- [`docs/decisions.md`](docs/decisions.md) — non-obvious decisions made during development

## What's New

See [CHANGELOG.md](CHANGELOG.md) for the full history.

### v0.1.0

Initial public release — 18 game modules including a live Cribbage peg board,
invite-only local auth, admin controls and Server Maintenance, Tailwind/shadcn/ui
mobile-first frontend, and GitHub Actions CI with ghcr.io image publishing.

## License

MIT — see [LICENSE](LICENSE).
