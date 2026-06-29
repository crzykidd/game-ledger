---
name: 45-feedback-feature-plan
status: done
created: 2026-06-28
model: opus
completed: 2026-06-28
result: >
  Designed the in-app feedback→GitHub-issue feature (plan only). Decisions recorded in
  docs/decisions.md: Contents-API upload to a dedicated `feedback-assets` branch with the raw
  URL embedded in the issue; write-only fine-grained PAT in a SUPER_ADMIN settings singleton
  (reusing the maintenance settings pattern); a `Feedback` table with the screenshot as an in-DB
  Bytes blob (excluded from export); POST /api/feedback (best-effort issue, always saves) + admin
  inbox + settings endpoints; AppShell button with lazy-loaded html2canvas + public-exposure
  warning. Build split into 46-feedback-backend then 47-feedback-frontend.
---

# Task (PLAN ONLY — no code): Design the in-app "Give feedback → GitHub issue" feature

Produce a concrete, buildable design + an implementation plan (split into backend + frontend coding
prompts) for the deferred feedback feature, now a **v0.1.0 blocker**. **Do not write feature code or
migrations** — this is a research/planning pass. Output a design doc as your final message and record
the design in `docs/decisions.md` (one commit; see "When done").

## Context / what the feature is

A **"Give feedback"** button on every page (mounted in `AppShell`). Clicking it captures a
**screenshot of the current page** plus the user's note/category and files it as a **GitHub issue** in
the project repo (`crzykidd/game-ledger`), while always saving the feedback in-app (admin inbox) so
nothing is lost if GitHub is unreachable.

## Hard constraints / facts (trust these)

- **Dev is plain HTTP** (homelab, non-secure context) → the browser's native screen-capture API
  (`getDisplayMedia`) is unavailable. Capture the page with **`html2canvas`** (DOM→canvas, no secure
  context needed). Account for its known limits (cross-origin images, the SVG cribbage board).
- **Repo is public GitHub**; `main` is PR-gated; commit convention = Conventional Commits, **no AI
  mention**. CI must stay green (any new deps/migrations go through the 7 checks).
- The app already has an **admin settings + maintenance** infrastructure
  (`backend/src/maintenance/`, `frontend/src/admin/AdminMaintenance.tsx`, a settings table/service) —
  reuse it for storing the GitHub integration config rather than inventing a new mechanism. Read it.
- Auth is invite-only; **every logged-in user is trusted** and may submit feedback.
- New issue-reference rule is in effect (`CLAUDE.md`): the feedback issues this creates should carry
  useful context so commits/release-notes can reference them.

## Questions the plan must answer (research + decide, with rationale)

1. **Screenshot → GitHub issue mechanism.** GitHub's REST API has no clean "attach image to issue"
   call. Determine the best self-contained approach and recommend one, e.g.:
   - Upload the PNG via the **Contents API** (`PUT /repos/{owner}/{repo}/contents/{path}`) to a
     **dedicated `feedback-assets` branch** (keeps `main` clean), then embed the raw image URL in the
     issue body (`![screenshot](<raw_url>)`). Confirm this renders in issues.
   - vs. keeping the screenshot only in the in-app inbox and linking to it (note: a homelab app URL
     won't be reachable by external issue viewers).
   - Recommend the approach, with the exact API calls and the downsides (repo clutter, cleanup).
2. **GitHub auth + config storage.** A **PAT** (fine-grained, issues:write + contents:write on the
   target repo) stored in admin settings + a configurable target repo. Specify: how it's stored, that
   it is **never returned in any API response** (write-only field), who can configure it (SUPER_ADMIN),
   and graceful behavior when unconfigured (feedback still saves in-app; no issue created).
3. **Data model.** Define a `Feedback` table (Prisma): id, reporter user, page/route, active module id
   + maturity (auto-tagged), category (bug/enhancement/question), text, screenshot storage (in-DB blob
   vs filesystem vs the maintenance backup dir — recommend), githubIssueUrl/number (nullable), status,
   createdAt. Note the migration this implies.
4. **API surface.** `POST /api/feedback` (create: store + best-effort GitHub issue), admin
   `GET /api/admin/feedback` (list/detail incl. screenshot), and the settings endpoints for the GitHub
   config. Best-effort issue creation must not fail the feedback save.
5. **Frontend.** The global "Give feedback" button (AppShell), the html2canvas capture + a modal
   (screenshot preview + text + category, auto-showing the captured page/module), submit flow, and an
   **admin feedback inbox** page (list + view screenshot + link to the GitHub issue). New dep:
   `html2canvas` (note bundle-size impact).
6. **Security / abuse.** PAT handling, rate-limiting feedback submissions, screenshot size limits,
   stripping nothing sensitive (the user opted in by clicking). Note the screenshot may contain
   on-screen data — the issue/inbox should make that visible to the submitter before sending.
7. **What's the minimum for 0.1.0** vs. nice-to-have (e.g. labels/category→GitHub-labels mapping,
   issue deduplication) — call out the cut line.

## Deliverable

1. A design doc (final message) covering decisions 1–7 with a clear recommendation each.
2. A concrete **implementation split**: name the coding prompts to write (e.g. `46-feedback-backend`,
   `47-feedback-frontend`), what each covers, their dependency order, and the new dependency/migration
   each introduces. Enough that those prompts can be written directly from this.
3. Risks/unknowns and how to verify (esp. the screenshot-in-issue render, tested against the real
   public repo).

## When done

1. Update this file's frontmatter (`status: done`, `completed`, `result`); `git mv` to `prompts/done/`.
2. Add the design decisions to `docs/decisions.md` (newest at top).
3. **One commit on `dev`** (`docs:` — this is planning only, no feature code), no AI mention, specific
   paths (`docs/decisions.md` + the moved prompt). No push. Report the design summary + the proposed
   implementation-prompt split back to the orchestrator.
