# Standards implemented

This project implements the following standards from the crzynet `homelab-configs` repo
(private — referenced by name and version only). Each row pins the **version** wired up.

| Standard | Version | Adopted | Notes |
|---|---|---|---|
| `handoff-prompt-workflow` @ 2.0.0 | 2.0.0 | 2026-06-24 | Build proceeds via handoff prompts in `prompts/` dispatched to **Sonnet** agents; snippet pasted into `CLAUDE.md`. Local deviation: agents commit directly on `dev` (one prompt → one commit) rather than ask-y/n. |
| `code-checkin-and-pr` @ 1.2.0 | 1.2.0 | 2026-06-24 (full, 2026-06-28) | Conventional Commits (`feat:`/`fix:`/`chore:`/`docs:`) + doc-with-code + no hook bypass. **Local deviations that survive:** no Claude/AI mention in commit messages; agents commit directly on `dev` (one prompt → one commit). **`main` is PR-gated** with required GitHub Actions CI checks (lint, test, SAST via CodeQL, image build); `dev` is the working branch; `main` is reached only via a reviewed PR that passes checks. |
| `release-prep-and-cut` @ 1.1.0 | 1.1.0 | 2026-06-28 | Two-phase semantic-versioned release workflow: `/release-prep` (version bump + changelog roll + doc sync + PR) and `/release-cut` (tag + GitHub release after merge). Commands installed in `.claude/commands/`. Canonical version source: root `package.json` `"version"` (bare, no `v`). In-app version display via `/api/version` endpoint + build-time `__APP_VERSION__` injection. |

## Standards explicitly NOT adopted (and why)

- **repo-sandbox-permissions** — not used. This host doesn't need the sandbox; `.claude/settings.json`
  just carries a broad permissions allowlist so dev agents run without constant approval prompts.
