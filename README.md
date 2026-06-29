# game-ledger

A self-hosted, mobile-first app for tracking game scores over time.

> **Status: pre-release / in active development.** Not yet at a stable v1.0 release. Expect
> breaking changes between commits. See [`docs/`](docs/) for the full design.

## Features

- **Pluggable game modules** — each game is a self-contained YAML definition (plus optional
  code for custom UI). Adding a new game does not touch the core. Ships with 18 modules
  including a live SVG Cribbage peg board.
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

## Quickstart

```bash
# Start all services (nginx + backend + frontend build + db)
docker compose up
```

The app is served at `http://localhost:8080` (override with `APP_PORT`). On first run,
the install wizard guides you through creating the Super Admin account.

For development with hot-reload:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Served at `http://localhost:8088` by default (`DEV_APP_PORT` to override).

## Documentation

Full design docs live in [`docs/`](docs/):

- [`docs/spec.md`](docs/spec.md) — concept, deployment topology, module system, offline design
- [`docs/module-contract.md`](docs/module-contract.md) — game-module contract (scoring types, UI tiers)
- [`docs/data-model.md`](docs/data-model.md) — database structure
- [`docs/user-management.md`](docs/user-management.md) — auth, roles, invites
- [`docs/games/catalog.md`](docs/games/catalog.md) — scoring models for every included game
- [`docs/decisions.md`](docs/decisions.md) — non-obvious decisions made during development

## License

MIT — see [LICENSE](LICENSE).
