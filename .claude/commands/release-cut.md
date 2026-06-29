---
description: Cut a GitHub release after the dev→main PR has merged and main CI is green
argument-hint: <version>   (e.g. 0.3.6 — must match what /release-prep prepared)
---

<!--
Customised from standards/release-prep-and-cut @ v1.1.0
(crzynet/homelab-configs/standards/release-prep-and-cut/README.md).

Project substitutions applied:

  VERSION_FILE        package.json (root) — "version": "X.Y.Z"

  MAIN_CI_WORKFLOW    CI   (workflow name in ci.yml)
                      Required job names: lint, config-parse, migrate-check,
                      compose-validate, test, codeql
                      (image-build is PR-only and does not run on push to main)

  PUBLISH_WORKFLOW    Publish images   (workflow name in publish.yml)

  RELEASE_IMAGE_TAGS  On release: published →
                        ghcr.io/crzykidd/game-ledger-backend:latest
                        ghcr.io/crzykidd/game-ledger-backend:<semver>   (e.g. 0.1.0)
                        ghcr.io/crzykidd/game-ledger-backend:<major>    (e.g. 0)
                        ghcr.io/crzykidd/game-ledger-frontend:latest
                        ghcr.io/crzykidd/game-ledger-frontend:<semver>
                        ghcr.io/crzykidd/game-ledger-frontend:<major>
-->

# Release Cut

You are publishing the GitHub release for **v$ARGUMENTS**. Run this ONLY
after:

- `/release-prep $ARGUMENTS` has merged into `main`, and
- the push-to-`main` CI + image-publish workflows are green and `:latest`
  images are in the registry at ghcr.io/crzykidd/game-ledger-backend and
  ghcr.io/crzykidd/game-ledger-frontend.

Publishing the release triggers the `release: published` event in
`Publish images`, which builds and pushes the production `:latest`,
`:$ARGUMENTS`, and `:<major>` images. So this step is the point of no return
for production images — verify before tagging.

## Execution rules

- `$ARGUMENTS` SHOULD be bare semver (no `v` prefix). If a leading `v` was
  typed (`v0.3.6`), strip it silently. After stripping, if the value does
  not match `MAJOR.MINOR.PATCH` exactly, STOP and ask for a valid version.
- The bare value MUST equal the current version in the root `package.json`
  on `main`. If it does not, STOP.
- The release tag is `v$ARGUMENTS` (with the `v` prefix). Before calling
  `gh`, assert the tag string matches `^v[0-9]+\.[0-9]+\.[0-9]+$` exactly.
  If it does not, STOP — never create a malformed tag.
- Do NOT add `Co-authored-by` lines anywhere.
- If any verification step fails, STOP and report. Do not create the tag.

## Step 1 — Verify we are releasing the right commit

1. `git fetch origin` and check out `main`: `git checkout main && git pull`.
2. Confirm the version in the root `package.json` equals `$ARGUMENTS`. If
   not, the prep PR is not merged (or the wrong version was passed) — STOP.
3. Confirm the working tree is clean.
4. Confirm `git log` shows the `chore(release): prepare v$ARGUMENTS` commit
   on `main`. If absent, STOP — the PR has not been merged.

## Step 2 — Verify CI is green on main

Use `gh` to confirm the latest runs on `main` for this commit succeeded:

1. `gh run list --branch main --limit 10` and confirm the most recent runs
   for the release commit concluded `success` for BOTH the **CI** workflow
   and the **Publish images** workflow.
2. If a run is still in progress, tell the user to wait and STOP — do not
   tag a commit whose images may not exist yet.
3. If a run failed, STOP and report which job failed.

The `CI` workflow must succeed on all required jobs: `lint`, `config-parse`,
`migrate-check`, `compose-validate`, `test`, and `codeql`. Note that
`image-build` does not run on push to `main` (it is PR-only) — its absence
from the results is expected and does not indicate a failure.

## Step 3 — Confirm the version tag does not already exist

`git tag -l "v$ARGUMENTS"` and `gh release view v$ARGUMENTS` — if either
exists, STOP and report. Never overwrite an existing release/tag.

## Step 4 — Assemble the release notes

Extract the `## [$ARGUMENTS] — <date>` section from `CHANGELOG.md`
(everything from that header up to, but not including, the next `## [`
header). This is the release body — the changelog is the single source of
truth, matching the PR description `/release-prep` created.

## Step 5 — Create the release

Write the extracted section to a temp file and pass it via `--notes-file`.
Create an annotated tag on the current `main` HEAD and publish the release
in one step with `gh`:

```
gh release create v$ARGUMENTS \
  --target main \
  --title "v$ARGUMENTS" \
  --notes-file <tmp>
```

Do not try to inline multi-line release notes.

## Step 6 — Verify the production build fired

1. `gh run list --workflow "Publish images" --limit 3` and confirm a run
   triggered by the `release` event for `v$ARGUMENTS` has started or
   succeeded.
2. Report its status.

## Step 7 — Report

Print:

- The release URL.
- The tag created (`v$ARGUMENTS`).
- The status of the production image build.
- A reminder of the expected image tags once the build finishes (where MAJOR
  is the major integer extracted from `$ARGUMENTS`, e.g. `0` for `0.1.0`):
  - `ghcr.io/crzykidd/game-ledger-backend:latest`
  - `ghcr.io/crzykidd/game-ledger-backend:$ARGUMENTS`
  - `ghcr.io/crzykidd/game-ledger-backend:{MAJOR}`
  - `ghcr.io/crzykidd/game-ledger-frontend:latest`
  - `ghcr.io/crzykidd/game-ledger-frontend:$ARGUMENTS`
  - `ghcr.io/crzykidd/game-ledger-frontend:{MAJOR}`

Done — the release is live.
