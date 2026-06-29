---
name: 46-feedback-backend
status: completed
created: 2026-06-28
model: sonnet
completed: 2026-06-29
result: FeedbackModule with migration, settings/GitHub/feedback services, controller, 18 tests (288 total); boot verified.
---

# Task: Feedback feature — backend (model, migration, GitHub-issue service, endpoints)

Implement the **backend** for the in-app "Give feedback → GitHub issue" feature, per the design
recorded in `docs/decisions.md` (the 2026-06-28 feedback-feature plan entry — **read it first**).
The frontend is prompt 47 and depends on this. **No new backend npm dependency** (use native `fetch`).

## Before you start

- Read the **feedback-feature design in `docs/decisions.md`** (decisions 1–7) — it is the spec.
- Read the **maintenance module as the pattern**: `backend/src/maintenance/` (its settings
  service/controller, the singleton settings model, RBAC guards, and `exportAll`), and how RBAC
  permissions/guards work (`backend/src/rbac/`), the throttler config, and `packages/contract`.

## Working tree check

`git status --porcelain` should show only this prompt file (exempt) + `prompts/47-*` if present
(the next prompt — **do not touch/stage it**). Latest dev commit is `808a6af` (the plan).

## What to do (per the design)

1. **Contract types** (`packages/contract`): add the feedback types — `Feedback`, `FeedbackCategory`
   (`bug | enhancement | question`), `FeedbackStatus` (`open | reviewed | closed` or as the design
   says), the create-feedback request shape, and the feedback-settings shapes (note: the settings GET
   shape exposes **`githubTokenSet: boolean`**, never the token). Use `export type` for type-only
   symbols. **Rebuild the contract** (compiles to `dist/`, consumed by the backend).
2. **Prisma migration** (one migration): a **`Feedback`** table (id, reporter user FK, route,
   `moduleKey?`, `moduleMaturity?`, `category` enum, `text`, `screenshot` `Bytes` with a ~2 MB cap
   enforced in code, `githubIssueUrl?`, `githubIssueNumber?`, `status` enum, `createdAt`), a
   **feedback-settings singleton** table (id, `githubRepo`, `githubToken`, `enabled`, updatedAt/by) —
   **a NEW table, do not overload `maintenance_settings`** — and the two enums. Generate the migration
   and ensure `prisma migrate deploy` from empty → head leaves no drift (the CI migration check runs
   exactly this).
3. **`FeedbackModule`**:
   - **FeedbackSettingsService** — get/update the singleton. The token is **write-only**: never
     return it; the GET DTO returns `githubTokenSet` (boolean) instead. Update is SUPER_ADMIN-only.
   - **GitHubService** (native `fetch`, no Octokit) — `createIssueWithScreenshot({repo, token,
     title, body, screenshotPng, feedbackId})`: ensure the **`feedback-assets`** branch exists
     (`GET .../git/ref/heads/feedback-assets`; if absent, read the default-branch sha and
     `POST .../git/refs`, ignoring 422), `PUT .../contents/feedback/{id}.png` (base64 content +
     `branch: feedback-assets`), then `POST .../issues` with the body embedding
     `![screenshot](https://raw.githubusercontent.com/{owner}/{repo}/feedback-assets/feedback/{id}.png)`
     plus the reporter/route/module metadata. Return `{ url, number }`. Throw on hard failures so the
     caller can treat it best-effort.
   - **FeedbackService** — `create(reporterUser, dto)`: validate + size-cap the screenshot, save the
     `Feedback` row first, then **best-effort** issue creation in `try/catch` (on success patch the
     row with the issue url/number; on failure log + still return 200). Plus `list`, `get`,
     `getScreenshot`, `updateStatus`.
   - **FeedbackController** — `POST /api/feedback` (any authenticated user; a dedicated `@Throttle`
     ~5/min/user); admin `GET /api/admin/feedback`, `GET /api/admin/feedback/:id`,
     `GET /api/admin/feedback/:id/screenshot` (returns the PNG), `PATCH /api/admin/feedback/:id`
     (status) — gated by the appropriate admin permission (match how AdminMaintenance/list endpoints
     are gated, e.g. VIEW_ALL); and `GET /api/feedback/settings` + `PUT /api/feedback/settings`
     (PUT = SUPER_ADMIN).
4. **Exclude `Feedback` from `exportAll`** (the maintenance JSON export) — screenshots are blobs.
5. Wire `FeedbackModule` into the app module.

## Conventions to honor

- TypeScript; match Nest/Prisma/maintenance conventions and the existing RBAC guard usage. No new
  npm dependency. Type-only `@game-ledger/contract` imports use `import type`.

## Tests (definition of done)

- Unit tests (Jest, mock Prisma + a mocked GitHubService/`fetch`):
  - Feedback create: saves the row; **best-effort** issue — success path patches issue url/number;
    GitHub-failure path still returns the saved feedback (no throw to the caller).
  - Settings: token is **write-only** — GET returns `githubTokenSet` and never the token value; PUT
    requires SUPER_ADMIN.
  - GitHubService: the branch-ensure → contents-PUT → issue-POST sequence is called with the right
    URLs/bodies (assert via the mocked fetch); 422 on branch create is ignored.
  - Size cap rejects oversized screenshots.
- Boot the backend (Nest DI) to confirm the module wires up — green unit tests via `new Service()`
  bypass the injector. Run the backend suite on the isolated DB per `prompts/startnewsession.md`.
- `pnpm --filter backend lint` + build clean.

## When done

1. Frontmatter (`status: done`, `completed`, `result`); `git mv` to `prompts/done/`.
2. `docs/decisions.md`: note any design refinements made during implementation (newest at top).
3. Update `prompts/startnewsession.md` (Current state / Last session) for the feedback backend.
4. **One commit on `dev`** (`feat:`, no AI mention), specific paths only, **no push**. Report
   hash / files / message / test counts, and the **exact API contract** (endpoints + request/response
   shapes + the `githubTokenSet` settings shape) prompt 47 needs.
