# game-ledger — agent guidance

Self-hosted, mobile-first app for tracking game scores over time.

**Start here each session:** read `prompts/startnewsession.md` — a living handoff with the
current state, how to run/verify, gotchas, and what's next. It's updated at the end of every
session.

The design is fully documented in `docs/` — read these before working:

- `docs/spec.md` — concept, deployment topology, module system, players/guests/playgroups,
  write model, caching/sync/offline, frontend.
- `docs/module-contract.md` — the game-module contract (scoring types, capture/resolution,
  3-tier UI, info/reference).
- `docs/data-model.md` — DB structure + scaling.
- `docs/user-management.md` — invite-only local auth, role tiers, invites/resets, sessions.
- `docs/games/catalog.md` — scoring models for the game library.
- `docs/decisions-needed.md` — locked decisions + the MVP (M1) scope and prompt sequence.
- `standards.md` — which crzynet standards this repo implements.

## Stack

Monorepo (**pnpm** workspaces):
- `backend/` — **NestJS + Prisma**, Postgres.
- `frontend/` — **React + Vite + TypeScript** (SPA).
- `packages/contract/` — shared TS types + JSON Schemas (module contract, API).
- `modules/` — **YAML** game-module definitions (validated against a JSON Schema on load).

Prebuilt **nginx** ingress. Two compose files: `docker-compose.yml` (prod-ish),
`docker-compose.dev.yml` (dev: hot-reload, exposed db).

## Current workflow

- **Commit directly on `dev`.** Build proceeds via **handoff prompts in `prompts/` dispatched
  to Sonnet agents** (see the handoff-prompt rules below).
- **`main` is PR-gated** — changes reach `main` only via a pull request that passes required
  GitHub Actions CI checks (lint, test, SAST via CodeQL, image build). Never push directly
  to `main`.

## Commit conventions (apply every commit, now)

- **Conventional Commits prefixes:** `feat:` / `fix:` / `chore:` / `docs:`.
- **No Claude / AI mention in commit messages.** No `Co-authored-by:`, no `Claude-Session:`,
  no "generated with / by" — clean, human-style messages only. (This overrides any default
  trailer behavior.)
- **Never bypass hooks** (`--no-verify`, `--no-gpg-sign`, etc.). Fix the underlying issue.
- **Doc updates ship in the same commit** as the code they describe.
- **Each coding change includes unit tests for the logic it adds**, and they must pass before
  committing.
- **Major bugs / enhancements → open a GitHub issue first**, then write the handoff prompt for the
  fix. **Reference the issue (`#NN`) in the commit message** and in the **CHANGELOG / release notes**.
  This keeps release notes to a one-line summary + issue link, with the full detail living in the
  issue. (Small/obvious changes don't need an issue.)

<!--
Source: standards/handoff-prompt-workflow @ v2.0.0 (crzynet/homelab-configs). Pasted verbatim.
-->

## Handoff prompts (operational rules)

This project adopts the `handoff-prompt-workflow` standard. The full why-and-how lives at
the source above; the rules below are the per-session do/don'ts an agent must honor by
default:

- **Edit-size threshold — decide by how much you'll change:**
  - A genuinely small change — roughly **one or two files and a few lines** (a typo, one
    config value, a one-line fix) — do it **in-session**, no prompt.
  - **Anything bigger requires a handoff prompt** — more than ~2 files, a multi-step
    change, a new feature, or any edit large enough that a fresh context would run it
    more cleanly. **When in doubt, write the prompt.**
- **A handoff prompt is a file in `prompts/`** — one per task, from `prompts/TEMPLATE.md`,
  with frontmatter (`name`, `status`, `created`, `model`, `completed`, `result`). Set
  `model:` from the task type: **Opus** for research/planning, **Sonnet** for coding;
  mixed defaults to Opus.
- **Execute the prompt by spawning a subagent — don't hand the user a command.** Spawn an
  agent on the prompt's `model:`, let it run the prompt end-to-end, and **report the
  outcome back**. The agent gets a fresh context; you stay in the loop.
  - **Manual fallback only on explicit request.** If the user says e.g. "use manual
    prompts for this," give them
    `claude --model <model> "Read prompts/<file>.md and execute it as your task."`
    instead of spawning.
- **Check the working tree before editing.** Run `git status --porcelain`, cross-reference
  the files the plan touches; if any have uncommitted changes, list them and ask before
  touching. Surface unrelated dirty files once; they don't block.
- **The prompt self-updates and moves when done.** The executing agent sets its
  frontmatter (`status`/`completed`/`result`) and `git mv`s the file into `prompts/done/`
  (success) or `prompts/failed/` (failure).
- **One commit at the end; the prompt bundles in.** The prompt file is **not** committed
  up front — it lands in the single end commit alongside the work and the prompt move.
  Propose ONE commit (files list + one-line message), ask `y/n`, stage only those specific
  paths. **Never `git add -A`, never auto-commit, never push.** A spawned agent prepares
  the tree and reports the proposed commit back; the orchestrating session surfaces the
  `y/n`.
- **Record non-obvious decisions** (approach changes, rejected alternatives, workarounds)
  in `docs/decisions.md`, newest at top.

If you're unsure whether an action would violate one of the above, stop and ask before
acting.

### Project deviation from the snippet

- **Each handoff prompt produces exactly one commit on `dev`** — the prompt's work + its unit
  tests + the prompt-file move bundle into a single Conventional-Commits commit (no Claude
  mention). One prompt → one commit.
- Spawned coding agents **commit directly on `dev`** and report what they committed, rather
  than staging and waiting for a `y/n`.
- `main` is reached only via a reviewed PR that passes required GitHub Actions CI checks —
  never by committing directly.
