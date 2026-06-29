---
name: 44-github-actions-ci
status: done
created: 2026-06-28
model: sonnet
completed: 2026-06-28
result: >
  Authored .github/workflows/ci.yml (7 PR checks: lint, config-parse, migrate-check,
  compose-validate, image-build, test, CodeQL) and .github/workflows/publish.yml (ghcr.io
  matrix: backend + frontend images; push dev→:dev/:sha, push main→:latest/:sha, release
  published→:latest/:semver/:major; inline Python retention keeps 30 sha-* and 15 semver,
  protects latest/dev/major). YAML validates cleanly. Unverified until first GitHub push.
---

# Task: GitHub Actions CI + ghcr publish workflows (the 7 required checks + image matrix)

Author the GitHub Actions workflows that implement the `code-checkin-and-pr` standard for the new
public repo: the **7 required PR checks** and the **ghcr.io image publish matrix + retention**. These
must exist in the initial public commit so they run on the first push and can be made required by
branch protection.

## Before you start

- Read `CLAUDE.md` (the "Current workflow" section now describes the GitHub PR-gated posture) and
  `standards.md` (`code-checkin-and-pr` is now fully adopted).
- Recent commit: `cdb18d9` (public-repo prep). Working tree should be clean apart from this prompt
  file (exempt).

## Facts (researched — trust these)

- **Monorepo, pnpm.** Node version is **24** (`.nvmrc`). No `packageManager` field — use
  `pnpm/action-setup` (pin a recent pnpm, e.g. 9) + `actions/setup-node@v4` (node 24, `cache: pnpm`),
  then `pnpm install --frozen-lockfile`.
- **Scripts:** root `pnpm -r run lint` / `pnpm -r run test` / `pnpm -r run build`. Per workspace:
  backend `eslint src --ext .ts` / `jest` / `nest build`; frontend `eslint src --ext .ts,.tsx` /
  `vitest run` / `tsc && vite build`; contract `tsc --noEmit` / `tsc && cp src/*.json dist/`.
- **Backend tests NEED Postgres** (many `*.spec.ts` use `PrismaClient`/`DATABASE_URL`). Frontend
  `vitest` needs no DB. So the **test** and **migrate** jobs require a Postgres **service** + a
  `DATABASE_URL` + `prisma migrate deploy` before running. Migrate command:
  `pnpm --filter backend exec prisma migrate deploy` (deploy script is `prisma migrate deploy`).
- **Prod images (2):** `backend/Dockerfile` and `frontend/Dockerfile` (the compose `nginx` service
  also builds from `frontend/Dockerfile`, so it's the same image). Confirm via `docker-compose.yml`.
  → publish two images: `ghcr.io/crzykidd/game-ledger-backend` and
  `ghcr.io/crzykidd/game-ledger-frontend`.
- **e2e (Playwright) is NOT a required check** — it needs the full stack. Keep it out of the gate
  (it can be a separate manual/nightly workflow later, or just left to local verification).
- These workflows **cannot be fully validated locally** — make the YAML valid and the commands match
  the repo's actual scripts; the first run on GitHub is the real test (the orchestrator will iterate
  on any red check after push).

## What to do

1. **`.github/workflows/ci.yml`** — triggers: `pull_request` targeting `main`, and `push` to `dev` and
   `main`. Implement the **7 checks** (jobs, parallel where possible):
   1. **Lint** — `pnpm -r run lint`.
   2. **Config validation** — every structured config parses: all `modules/*.yaml`, `docker-compose*.yml`,
      and `*.json` (package.json, tsconfig, the contract JSON Schemas). A small inline node script (or
      `yq`/`jq` loop) that fails on any parse error is fine.
   3. **DB migration check** — Postgres service; `prisma migrate deploy` onto the empty DB, then assert
      the schema is at head with **no drift** (`pnpm --filter backend exec prisma migrate status`
      should report up to date; fail otherwise).
   4. **Compose validation** — `docker compose -f docker-compose.yml config -q` and
      `docker compose -f docker-compose.dev.yml config -q`.
   5. **Image build (PR-only, no push)** — build `backend/Dockerfile` and `frontend/Dockerfile`
      (`docker/build-push-action` with `push: false`, or `docker build`). Gate this job on the event
      being a PR (build verification only).
   6. **Test suite** — Postgres service + `DATABASE_URL` + `prisma migrate deploy`, then
      `pnpm --filter backend test` and `pnpm --filter frontend test` (and contract if it has a real
      test). **Do NOT run Playwright e2e here.**
   7. **SAST — CodeQL** — `github/codeql-action` (init + analyze) for `javascript-typescript`. Either a
      job in this file or a separate `.github/workflows/codeql.yml` triggered on the same events. The
      gate is that it **runs/completes** (findings go to the security tab; they don't auto-fail the PR).
2. **`.github/workflows/publish.yml`** — build + push the two images to **ghcr.io** with the matrix:
   | Trigger | Tags |
   |---|---|
   | push → `dev` | `:dev`, `:sha-<short>` |
   | push → `main` | `:latest`, `:sha-<short>` |
   | `release: published` | `:latest`, `:<semver>`, `:<major>` |
   - Auth: built-in `GITHUB_TOKEN` with `permissions: packages: write`; `docker/login-action` against
     `ghcr.io`. Use `docker/metadata-action` (`type=ref` for branch, `type=sha` short, `type=semver`
     for release tags incl. major) so a `vX.Y.Z` release yields `:X.Y.Z` + `:<major>` + `:latest`.
   - **Retention cleanup** (after publish, per image): keep the **30** most recent `:sha-*` and **15**
     most recent semver tags; **protect** `:latest`, `:dev`, and bare-major tags (never prune). Use
     `actions/delete-package-versions` or the ghcr REST API in a small step/job.
3. Confirm the image list against `docker-compose.yml` (backend + the frontend/nginx image). If a
   third buildable prod image genuinely exists, include it; otherwise two images.

## Conventions to honor

- Pin action versions (`@v4`/`@v3` etc.). Use `concurrency` to cancel superseded runs per ref. No
  secrets beyond the built-in `GITHUB_TOKEN`. YAML must be valid (`yq`/`yamllint` clean).

## Tests (definition of done)

- No app code changes. **Validate the workflow YAML parses** (e.g. `yq e '.' .github/workflows/*.yml`
  with no error) and that every command referenced matches a real repo script/path. (Full CI
  validation happens on the first GitHub push — out of scope to run here.)
- Don't break the existing suites: a quick `pnpm -r run lint`/`build` sanity is optional (you changed
  no source).

## When done

1. Frontmatter (`status: done`, `completed: 2026-06-28`, `result`); `git mv` to `prompts/done/`.
2. `docs/decisions.md` (newest at top): note the CI (7 checks, CodeQL SAST, e2e out of gate) + publish
   (ghcr matrix + retention) workflows authored; GitHub-hosted runners; Postgres service for
   test/migrate jobs.
3. Update `prompts/startnewsession.md` (Current state / Last session) for the CI workflows.
4. **One commit on `dev`** (`chore:` or `ci:` — use `ci: add GitHub Actions CI + ghcr publish
   workflows`), no AI mention, specific paths only, **no push**. Report hash / files / message, the
   final image list, and explicitly note that the workflows are **unverified until the first GitHub
   push** (the orchestrator will watch the first run and fix-forward any red checks).
