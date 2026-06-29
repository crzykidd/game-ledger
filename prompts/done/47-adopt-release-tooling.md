---
name: 47-adopt-release-tooling
status: done
created: 2026-06-29
model: sonnet
completed: 2026-06-29
result: >
  Adopted release-prep-and-cut @ v1.1.0. Installed /release-prep + /release-cut in
  .claude/commands/ (all placeholders filled). Created CHANGELOG.md with [Unreleased] +
  populated [0.1.0] entry (date placeholder <DATE>). Added version: 0.1.0 to root package.json.
  Backend GET /api/version endpoint (VersionModule). Frontend VersionBadge (build-time
  __APP_VERSION__ via Vite define). README badge + What's New. CLAUDE.md snippet pasted
  (de-linked). standards.md row added. All unit tests pass; lint and build clean.
---

# Task: Adopt `release-prep-and-cut` — install the release commands + 0.1.0 prerequisites

Set up everything needed to cut releases (starting with **v0.1.0**) per the `release-prep-and-cut`
standard: install the `/release-prep` + `/release-cut` commands customized for this repo, create
`CHANGELOG.md`, establish the canonical version source + an in-app version display, and wire the docs.
**This prompt does NOT cut the release** — it makes the repo *ready* to. The orchestrator runs the cut.

## Before you start

- **Read the standard** at `~/projects/homelab-configs/standards/release-prep-and-cut/`:
  `README.md`, `release-prep.md` (the `/release-prep` command template), `release-cut.md` (the
  `/release-cut` template), and `CLAUDE-snippet.md`. These are the source of truth for what to install.
- Read `CLAUDE.md` (commit conventions, the GitHub PR-gated workflow), `standards.md`,
  `.github/workflows/ci.yml` + `publish.yml` (you'll reference their names/jobs), the root
  `package.json` and the three workspace `package.json`s, and `README.md`.

## Working tree check

`git status --porcelain` should show only this prompt file (exempt). Latest dev commit is `e375fe6`
(the feedback revert). Surface any other dirty files.

## Decisions (locked with the user)

- **Canonical version source = root `package.json` `"version"`**, stored **bare** (`0.1.0`, no `v`).
  The three workspace package.jsons are already `0.1.0` — keep them consistent with root (the release
  command will bump root; note in the command how workspaces stay in sync, or keep it simple and have
  prep update all of them).
- **In-app version display:** small/subtle — the backend exposes the version and the frontend shows it
  unobtrusively (e.g. an `/api/version` endpoint or an existing meta endpoint + a footer/admin line).
  The version the app reports must come from the canonical source (read it at runtime/build, don't
  hardcode a second copy).
- Commit policy unchanged: Conventional Commits, **no AI mention**; the gitea URL in the standard's
  CLAUDE-snippet must be **de-linked** (reference by name + version) to match the public-repo cleanup.

## What to do

1. **Install the commands.** Copy `release-prep.md` and `release-cut.md` into this repo's slash-command
   location (`.claude/commands/` — confirm by how the repo is structured) and **fill every placeholder**
   for this project:
   - `<VERSION_FILE>` → root `package.json` (the `version` field).
   - `<LOCAL_CHECKS>` → the exact command set CI runs that can run locally (e.g. `pnpm -r run lint`,
     `pnpm -r run build`, `pnpm -r run test` with the isolated DB, config/compose validation) — match
     `.github/workflows/ci.yml`.
   - `<MAIN_CI_WORKFLOW>` / `<PUBLISH_WORKFLOW>` → the actual workflow names/files (`ci.yml`,
     `publish.yml`).
   - `<RELEASE_IMAGE_TAGS>` → `:latest`, `:<semver>`, `:<major>` (per `publish.yml`).
   - `<CHANGELOG_ARCHIVE_DIR>` → `docs/` (per the standard's summarize-on-archive rule).
   - Any other placeholders the templates contain — fill them all; leave none.
2. **`CHANGELOG.md`** (repo root, Keep-a-Changelog format): a `## [Unreleased]` section (empty
   subsections) **plus a populated `## [0.1.0] — <date>`** entry. Draft the 0.1.0 notes from the actual
   project (read `prompts/startnewsession.md` + `docs/decisions.md` + git log) — a concise,
   user-facing summary grouped Added/Changed/Fixed: the game-tracking core (18 modules incl. the live
   Cribbage peg board), released/pre-release library gating, invite-only auth + admin + roles, Server
   Maintenance (backup/restore), the public GitHub move + CI/CD, etc. Keep it honest and high-level
   (one line per item, not a commit dump). **Leave the date as a placeholder `<DATE>` or today's
   intended date** — the orchestrator stamps it at cut time; do NOT invent a timestamp (you cannot
   read the clock reliably).
3. **Version source + in-app display:**
   - Ensure root `package.json` has `"version": "0.1.0"`; reconcile the workspace versions to match.
   - Add the **backend version endpoint** (reads the canonical version — e.g. from the root
     `package.json` baked in at build, or an injected env; pick the approach that works in the prod
     image where `/app/package.json` is present) and a **subtle frontend display**. Unit-test the
     endpoint + that the frontend renders the version.
4. **README:** add a **version badge** (e.g. a shields.io release badge pointing at the GitHub
   releases) and a short **"What's New"** section linking to `CHANGELOG.md`. (The `/release-prep`
   command will keep these in sync going forward — they must exist now.)
5. **`CLAUDE.md`:** paste the `release-prep-and-cut` **CLAUDE-snippet verbatim** (de-linking the gitea
   URL — reference the standard by name + version instead).
6. **`standards.md`:** add a row for **`release-prep-and-cut`** at the version shown in the standard's
   `README.md`, marked adopted.

## Conventions to honor

- TypeScript for any code; tests for the version endpoint/display. Type-only `@game-ledger/contract`
  imports use `import type`. Do not invent a clock value anywhere.

## Tests (definition of done)

- Unit tests for the in-app version endpoint + the frontend version display.
- `pnpm -r run lint` + `pnpm -r run build` + the backend/frontend suites pass (isolated DB per
  `prompts/startnewsession.md`). The migration check is unaffected (no schema change expected).
- Confirm `CHANGELOG.md`, both command files (placeholders all filled — `grep` for stray `<...>`
  placeholders → none remain except the intentional `<DATE>` in the changelog), the README badge +
  What's New, the CLAUDE snippet, and the standards.md row all exist.

## When done

1. Frontmatter (`status: done`, `completed: 2026-06-29`, `result`); `git mv` to `prompts/done/`.
2. `docs/decisions.md` (newest at top): note the version-source choice (root `package.json`, bare),
   the in-app version display approach, and the release-tooling adoption.
3. Update `prompts/startnewsession.md` (Current state / Last session) for the release tooling.
4. **One commit on `dev`** (`chore:` — e.g. `chore: adopt release-prep-and-cut tooling and 0.1.0
   prerequisites`), no AI mention, specific paths only, **no push**. Report hash / files / message, the
   command-install location, and confirm no unfilled placeholders remain — the orchestrator will then
   run `/release-prep 0.1.0`.
