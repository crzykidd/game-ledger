# Changelog

All notable changes to game-ledger are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!-- Add entries here as work lands on dev. -->

### Added

### Changed

### Fixed

---

## [0.1.0] — 2026-06-29

Initial public release of game-ledger — a self-hosted, mobile-first app for
tracking game scores over time.

### Added

- **18 game modules** covering a range of scoring types: numeric rounds
  (Hearts, Spades, Gin Rummy, Skyjo, Yahtzee, Cribbage, and more), rank-order
  finish (3UP 3DOWN, Big Two, President, Coup, Exploding Kittens, Liar's Dice),
  and winner-pick (Cards Against Humanity, Apples to Apples).
- **Three scoring-type engines**: `numeric_rounds` (per-round totals, high or
  low wins, optional target), `rank_order` (finish-order capture), and
  `winner_pick` (round-winner selection).
- **Cribbage live peg board** — the only `released` game at launch: real-time
  SVG two-peg leapfrog board with skunk lines, per-peg undo, deal rotation,
  and mid-deal win detection.
- **Module maturity model** (`released` / `pre_release`) — game picker shows
  released games only by default; a toggle reveals pre-release games. Cribbage
  is the sole released game.
- **Start-New-Game UX** — sorted game dropdown (most-played-first, then alpha),
  count-toggle buttons, and per-seat player dropdowns with deduplication.
- **Per-user play counts** on `GET /api/modules` for sorting the game picker.
- **Invite-only local auth** with role tiers (Super Admin, Admin, Manager,
  Player, Guest) and per-user permission overrides. No open signup.
- **Admin controls** — user management (invite, reset, disable), playgroup
  management, and full audit log.
- **Server Maintenance page** — on-demand and scheduled DB backup/restore
  (`pg_dump`/`pg_restore`), JSON data export, and VACUUM/REINDEX, all gated
  by role.
- **Self-hosted Docker Compose deployment** with nginx ingress, automatic
  schema migrations on startup, and a first-run install wizard.
- **Frontend** built on Tailwind CSS + shadcn/ui + Framer Motion; mobile-first
  responsive design with dark-mode support.
- **Public GitHub repository** (`crzykidd/game-ledger`, MIT license) with
  GitHub Actions CI (lint, config validation, migration check, compose
  validation, test suite, CodeQL SAST) and ghcr.io image publishing with a
  version-tag matrix (`:latest`, `:<semver>`, `:<major>`).
- **In-app version display** — backend `/api/version` endpoint + subtle
  version indicator in the app footer.

---

## Archived releases

<!-- Per-minor archive files live in docs/. -->
