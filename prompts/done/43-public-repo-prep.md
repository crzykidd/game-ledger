---
name: 43-public-repo-prep
status: done
created: 2026-06-28
model: sonnet
completed: 2026-06-28
result: >
  Added MIT LICENSE and public README.md. Removed all [private-gitea] URLs from tracked
  files (standards.md, CLAUDE.md, docs/spec.md). Updated code-checkin-and-pr to fully adopted
  with GitHub PR-gated posture. Genericized admin email in startnewsession.md. Updated
  CLAUDE.md workflow section, docs/decisions-needed.md P4 section, docs/decisions.md (new
  entry), and docs/spec.md Engineering/ops section. git grep -n [private-gitea] is empty.
---

# Task: Prepare game-ledger to become a PUBLIC GitHub repo — LICENSE, README, link/doc cleanup

We're relocating to a **new public GitHub repo** `crzykidd/game-ledger` (MIT), as a **fresh "Initial
public release"** (no old history carried over), and **retiring Gitea**. This prompt makes the working
tree public-ready: add the license + a public README, and **remove/clean up every private-infra link
and internal reference** so nothing in the public repo points at the retired Gitea or leaks homelab
details. (The GitHub Actions CI/publish workflows are a separate prompt — not this one.)

## Before you start

- Read `CLAUDE.md`, `standards.md`, `docs/spec.md`, `docs/decisions-needed.md`,
  `prompts/startnewsession.md` (you'll edit several of these).

## Working tree check

`git status --porcelain` should show only this prompt file (exempt) + `prompts/44-*` if present (the
next prompt — **do NOT touch/stage it**). Surface other dirty files.

## Facts (researched — trust these)

- **No LICENSE, no README** at repo root today.
- **Private-infra references to remove/clean up** (these 404 or leak once Gitea retires) — found in:
  - `standards.md` — multiple `https://[private-gitea]/crzynet/homelab-configs/...` standard links.
  - `CLAUDE.md` — a `[private-gitea]/crzynet/homelab-configs` source link (handoff-prompt snippet).
  - `docs/spec.md` — `**Source:** Gitea ([private-gitea]) for now; likely GitHub later.`
  - `prompts/startnewsession.md` — homelab FQDN `crzydev.home.arpa`, the real admin email
    (genericize it), and the gitea push note.
- **Decision (from the user):** **remove the private links.** Reference standards by **name + version
  only** (no URL) — e.g. "`code-checkin-and-pr` @ 1.2.0" — since the standards repo stays private.
  Where a link genuinely has a public GitHub home, point there; otherwise drop it.
- Keep generic `*.home.arpa` / `localhost` examples (RFC-non-routable, harmless), but **genericize PII**
  (replace the real admin email with a placeholder like `admin@example.com` / "your admin account").
- **Commit policy unchanged:** Conventional Commits, **no AI/Claude mention** (stays even on the public
  repo). `repo-sandbox-permissions` stays **NOT** adopted.

## What to do

1. **`LICENSE`** at repo root — standard **MIT** text, `Copyright (c) 2026 crzykidd`.
2. **`README.md`** at repo root — a clean public-facing readme. Include: a one-line description
   (self-hosted, mobile-first app for tracking game scores over time), an honest **status** note
   (pre-release / in active development), a short **features** list (pluggable game modules incl. the
   live Cribbage board; players/guests/playgroups; invite-only local auth + admin; DB backup/restore
   maintenance), the **tech stack** (pnpm monorepo — NestJS + Prisma + Postgres backend, React + Vite +
   TS frontend, nginx ingress, Docker Compose), a **quickstart** (`docker compose up`), a pointer to
   `docs/`, and a **License: MIT** line. No version badge yet (the version source-of-truth lands with
   the release pipeline). Keep it concise and accurate — do not overstate maturity.
3. **Clean up the links/refs** listed above:
   - `standards.md`: replace each gitea URL with the bare standard **name + version**; **flip
     `code-checkin-and-pr` from "partial (commit conventions only)" to full adoption** — note the repo
     now uses GitHub: `main` is **PR-gated with required CI checks**, `dev` is the working branch, and
     the local deviations that **survive** are: no AI mention in commits, and agents commit directly on
     `dev` (one prompt → one commit) — but **`main` is reached only via a reviewed PR that passes
     checks**. (The `release-prep-and-cut` standard is adopted in a later prompt — leave it noted as
     not-yet-adopted / coming with the release pipeline.)
   - `CLAUDE.md`: remove the gitea source URL; update the **"Current workflow"** section — the
     "dev-only / local-build, CI deferred" posture is **retired**; describe the GitHub posture (commit
     on `dev`; `main` is PR-gated by GitHub Actions). Keep the commit-conventions section (no AI
     mention) verbatim.
   - `docs/spec.md`: change the Source line to GitHub (public).
   - `prompts/startnewsession.md`: remove the gitea-push note, genericize the admin email, keep the
     FQDN/localhost examples; update the "Workflow" line to the new GitHub PR-gated posture.
4. **`docs/decisions.md`** (newest at top): record the relocation — public GitHub repo
   `crzykidd/game-ledger`, **MIT**, **fresh initial-commit** (no gitea history carried over), Gitea
   retired, `code-checkin-and-pr` now fully adopted (`main` PR-gated), private links removed.
5. **`docs/decisions-needed.md`**: in the P4 ops/process section, mark the deferred items
   (branch protection, dev→main PRs, CI, image publish/retention) as **now being implemented** on
   GitHub (note the SAST choice is CodeQL on public GitHub, not Semgrep/Trivy).

## Conventions to honor

- Markdown only (plus the LICENSE). No code/behavior changes. Accurate, concise public docs.

## Tests (definition of done)

- No code changed, so no new unit tests. **Sanity-grep** that no `[private-gitea]` references remain
  in tracked files (`git grep -n [private-gitea]` → empty), and that `LICENSE` + `README.md` exist.
  Run `pnpm -w test` is NOT required (docs-only), but confirm the repo still typechecks if your edits
  touched anything beyond markdown (they shouldn't).

## When done

1. Frontmatter (`status: done`, `completed: 2026-06-28`, `result`); `git mv` to `prompts/done/`.
2. **One commit on `dev`** (`chore:` or `docs:` — pick the right prefix; this is repo-meta, suggest
   `chore: prepare repo for public GitHub release (license, readme, link cleanup)`), no AI mention,
   specific paths only, **no push**. Report hash / files / message, and **confirm `git grep -n
   [private-gitea]` is empty**.
