---
description: Prepare a release — bump version, roll changelog, sync docs, validate, commit, push to dev, open PR
argument-hint: <version>   (e.g. 0.3.6)
---

<!--
Customised from standards/release-prep-and-cut @ v1.1.0
(crzynet/homelab-configs/standards/release-prep-and-cut/README.md).

Project substitutions applied:

  VERSION_FILE          package.json (root of the monorepo)
  VERSION_LITERAL       "version": "X.Y.Z"   (bare semver, no v prefix)

  README_BADGE_PATTERN  Dynamic GitHub releases badge — self-updating, no version
                        string in the URL. No per-release badge substitution needed;
                        the badge reflects the latest release automatically.

  README_WHATSNEW_SECTION   ## What's New

  DOCS_TO_SYNC          standards.md — verify release-prep-and-cut row is still accurate
                        (no version-specific content to update; it tracks standard versions,
                        not the app version)

  LOCAL_CHECKS          See Step 6 below — pnpm lint, config-parse, compose-validate, tests
                        (requires an isolated Postgres; see prompts/startnewsession.md).

  CHANGELOG_ARCHIVE_DIR docs/

  MAIN_CI_WORKFLOW      CI   (ci.yml, job names: lint / config-parse / migrate-check /
                              compose-validate / image-build / test / codeql)
  PUBLISH_WORKFLOW      Publish images   (publish.yml)

  RELEASE_IMAGE_TAGS    :latest, :<semver>, :<major>
                        ghcr.io/crzykidd/game-ledger-backend:<tag>
                        ghcr.io/crzykidd/game-ledger-frontend:<tag>

  WORKSPACE_VERSION_SYNC  Three workspace package.jsons must stay in sync with root:
                          backend/package.json, frontend/package.json,
                          packages/contract/package.json
                          Update all four in Step 1.
-->

# Release Prep

You are preparing release **v$ARGUMENTS**. This command does ONLY the prep + PR
steps. It does **not** merge and does **not** create the GitHub release — the
human merges, and `/release-cut` (run after `main` CI is green) creates the
release.

## Execution rules

- Work on the `dev` branch. Never push directly to `main`.
- Do NOT add `Co-authored-by` lines to the commit.
- Do NOT create the GitHub release or tag in this command.
- If any validation step fails, STOP and report — do not commit broken state.
- Make exactly ONE commit covering version + changelog + all doc updates.
- `$ARGUMENTS` is the target version. It SHOULD be bare semver, no `v` prefix
  (e.g. `0.3.6`). If a leading `v` was typed (`v0.3.6`), strip it silently and
  proceed with the bare number. After stripping, if the value is empty or does
  not match `MAJOR.MINOR.PATCH` exactly (three integers, dot-separated, no
  pre-release/build suffix), STOP and ask for a valid version.
- Reminder on the `v` convention: the version is stored and used BARE
  everywhere (`package.json`, changelog header, README badge, in-code image
  tags). The `v` prefix is added in exactly one place — the git tag / GitHub
  release — and that happens in `/release-cut`, not here.

## Step 0 — Preflight

1. Confirm the current branch is `dev`. If not, STOP and report.
2. Confirm the working tree is clean (`git status --porcelain` empty). If
   there are uncommitted changes, STOP and show them — the user must decide.
3. Read the current version from the root `package.json` `"version"` field.
   Parse both the current version and `$ARGUMENTS` into `(MAJOR, MINOR, PATCH)`
   integer triples for comparison.

### 0a — Hard stops (never proceed past these)

- **Not newer.** If `$ARGUMENTS` is not strictly greater than the current
  version (compared as integer triples, not string compare), STOP and report.
  This blocks re-running an already-shipped version, going backward, or a typo
  that lands on an old number. Equal-to-current also stops.
- **Tag already exists.** Run `git fetch --tags` then check both
  `git tag -l "v$ARGUMENTS"` and `gh release view "v$ARGUMENTS"`. If either
  exists, STOP and report — the release already exists and must not be
  clobbered.

### 0b — Bump-tier classification (warn + confirm)

Classify the jump from current → target. Only a clean single-patch bump
proceeds silently; everything else pauses for explicit confirmation.

- **Patch bump** = MAJOR and MINOR unchanged, PATCH increased.
  - If PATCH increased by exactly 1 (e.g. `0.3.3` → `0.3.4`): proceed, no
    prompt.
  - If PATCH skipped ahead (e.g. `0.3.3` → `0.3.7`): WARN that N patch
    versions were skipped, show the expected next patch (current with
    PATCH+1), and require explicit confirmation before proceeding.

- **Minor bump** = MINOR increased (MAJOR unchanged), e.g. `0.3.3` → `0.4.0`.
  ALWAYS warn and require confirmation, even for the clean `.0` case. Message:
  this is a **new minor release**, which is infrequent — confirm it's
  intended. Note that a new minor also fires the changelog archive trigger
  (Step 3). If the target is a minor bump but PATCH is not `0` (e.g.
  `0.3.3` → `0.4.2`), additionally flag that new minors normally start at
  `.0`.

- **Major bump** = MAJOR increased, e.g. `0.3.3` → `1.0.0`. ALWAYS warn with
  strong language and require explicit confirmation: this is a **major
  release**, the rarest and most consequential bump, and it produces a new
  `:<major>` image tag. If MINOR or PATCH is not `0` (e.g. `1.2.0`),
  additionally flag that major releases normally start at `X.0.0`.

When warning, always show the three "expected next" successors from the
current version so the user can see what they may have meant:
next patch (`MAJOR.MINOR.PATCH+1`), next minor (`MAJOR.MINOR+1.0`),
next major (`MAJOR+1.0.0`).

Do not proceed on any warned tier without a clear affirmative ("yes",
"confirmed", etc.) in the chat. If the user declines, STOP.

### 0c — Remaining setup

4. Determine whether this is a **new minor/major** (MINOR or MAJOR differs from
   current) or a **patch within the current minor**. This decides whether the
   archive trigger fires (Step 3): minor and major bumps archive **every closed
   minor series** still in the active file; patch bumps archive nothing.
5. Capture today's date as `YYYY-MM-DD` for the changelog header.

## Step 1 — Bump the version

Update the version in all four `package.json` files to `$ARGUMENTS` (bare,
no `v`). All four must stay in sync:

1. Root `package.json` — `"version": "$ARGUMENTS"` (canonical source of truth)
2. `backend/package.json` — same value
3. `frontend/package.json` — same value
4. `packages/contract/package.json` — same value

Edit each file in-place, changing only the `"version"` field.

## Step 2 — Roll the changelog

In `CHANGELOG.md`:

1. Change the `## [Unreleased]` header to `## [$ARGUMENTS] — <today>`.
2. Insert a fresh empty `## [Unreleased]` block (matching whatever HTML-comment
   skeleton the file already uses) directly above the new version header.
3. Leave the rolled section's entries exactly as written by the dev work — do
   not rewrite them, but DO sanity-check that every entry is user-facing prose
   and sits under a correct category heading (Added / Changed / Fixed /
   Security / Deprecated / Removed). Fix obvious miscategorisation only.
4. If the `[Unreleased]` section is empty (no entries to ship), STOP and
   report — there is nothing to release.

## Step 3 — Per-minor archive trigger (MINOR/MAJOR ONLY — summarize-on-archive)

Run this step only when Step 0 determined this is a **new minor (`0.x.0`) or
major (`x.0.0`) bump**. For a **patch release** (e.g. `0.3.6`), do NOT archive
anything — skip this step entirely.

Archive **every closed minor series** still living in the active `CHANGELOG.md`
(every series whose MINOR is below the new current minor), not just the
immediately-prior one — this clears any deferred backlog in one pass. For each
such closed series `<minor>.x`:

1. **Move the full detail to the archive.** Move the entire series (all its
   `## [<minor>.PATCH] — <date>` blocks, full content) out of `CHANGELOG.md` into
   `docs/CHANGELOG-<minor>.x.md`, newest-first, matching the format of any
   existing archive file. Full Keep-a-Changelog detail is preserved here.
2. **Leave a summary in the active file.** In place of each moved version, write a
   condensed summary block:
   - Heading: `## [<version>] — <date> (summary)`.
   - Body: **one bullet per major feature or fix.** Use judgment to **drop
     small/trivial entries** (typo fixes, copy tweaks, minor internal cleanups);
     keep user-visible features and significant fixes. Phrase each as a tight
     one-liner.
   - End the block with a deep link to the full archived section, e.g.
     `[Full notes →](docs/CHANGELOG-<minor>.x.md#<anchor>)`
     (anchor = the GitHub-style slug of the full header, e.g. `031--2026-06-21`).
3. Prepend a link to each new archive file in the "Archived releases" index at the
   bottom of `CHANGELOG.md` (create the index if absent).
4. Confirm the active `CHANGELOG.md` now holds `[Unreleased]` + the **current**
   minor series in **full detail** + each older minor as a **summary block** (with
   archive deep links).

## Step 4 — Sync the README

In `README.md`:

1. **Version badge** — the badge is a dynamic GitHub releases badge
   (`img.shields.io/github/v/release/crzykidd/game-ledger`) that auto-reflects
   the latest release. **No badge URL substitution is needed.** Verify it exists
   and links to `https://github.com/crzykidd/game-ledger/releases/latest`.
2. Add a `### v$ARGUMENTS (<today>)` entry at the top of the `## What's New`
   section, summarising this release in user-facing language drawn from the
   changelog entries you just rolled. Keep it consistent with the voice of the
   existing entries.
3. Update any top-of-file new-in banner / one-line status blurb to reference
   `$ARGUMENTS` if it currently names a specific version.

## Step 5 — Sync long-form docs

For `standards.md`: verify the `release-prep-and-cut` row is present and that
the standard version listed is still correct (standard is at v1.1.0 per the
adoption commit). The app version does not appear in `standards.md` — no edit
needed unless the standard itself was updated. Report current state.

## Step 6 — Validate locally BEFORE committing

Run the same checks CI will run, so a red PR is caught now. Run each in order;
STOP and report exactly what failed if any check fails — do not commit.

```bash
# 1. Lint
pnpm -r run lint

# 2. Config validation (matches CI config-parse job)
python3 - << 'PYEOF'
import yaml, glob, sys
paths = (
    glob.glob('modules/**/module.yaml', recursive=True)
    + ['docker-compose.yml', 'docker-compose.dev.yml']
)
errors = []
for path in paths:
    try:
        yaml.safe_load(open(path))
        print(f'OK  {path}')
    except Exception as exc:
        errors.append(f'FAIL {path}: {exc}')
        print(f'FAIL {path}: {exc}', file=sys.stderr)
sys.exit(1 if errors else 0)
PYEOF

python3 - << 'PYEOF'
import json, os, sys
errors = []
skip_dirs = {'.git', 'node_modules', 'dist', '.pnpm'}
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in skip_dirs]
    for fname in files:
        if not fname.endswith('.json'):
            continue
        path = os.path.join(root, fname)
        try:
            json.load(open(path))
            print(f'OK  {path}')
        except Exception as exc:
            errors.append(f'FAIL {path}: {exc}')
            print(f'FAIL {path}: {exc}', file=sys.stderr)
sys.exit(1 if errors else 0)
PYEOF

# 3. Compose config validation
docker compose -f docker-compose.yml config -q
docker compose -f docker-compose.dev.yml config -q

# 4. DB migration check (requires isolated Postgres — see prompts/startnewsession.md)
#    Spin up a throwaway DB first:
#      docker run -d --name gl-release-check -e POSTGRES_USER=gameledger \
#        -e POSTGRES_PASSWORD=gameledger -e POSTGRES_DB=gameledger_check \
#        -p 55433:5432 postgres:16-alpine
#    Then:
DATABASE_URL=postgresql://gameledger:gameledger@localhost:55433/gameledger_check \
  pnpm --filter backend exec prisma migrate deploy
DATABASE_URL=postgresql://gameledger:gameledger@localhost:55433/gameledger_check \
  pnpm --filter backend exec prisma migrate status
#    Clean up: docker rm -f gl-release-check

# 5. Test suite (same isolated DB for backend tests)
DATABASE_URL=postgresql://gameledger:gameledger@localhost:55433/gameledger_check \
  pnpm --filter backend test
pnpm --filter frontend test
```

Also grep for version-string drift: confirm no stale `<old-version>`
references remain in `README.md`, `package.json` (root + workspaces), or
any file listed in DOCS_TO_SYNC. Report any other occurrences found rather
than blindly editing.

## Step 7 — Commit

Stage exactly these paths and make ONE commit. No `Co-authored-by` lines.

```
package.json
backend/package.json
frontend/package.json
packages/contract/package.json
CHANGELOG.md
README.md
standards.md               (only if changed)
<docs/ archive file(s)>    (only on minor/major bump)
```

Template:

```
chore(release): prepare v$ARGUMENTS

- package.json (root + workspaces) bumped to $ARGUMENTS
- CHANGELOG: rolled [Unreleased] → [$ARGUMENTS] — <today>
- README: What's New entry for v$ARGUMENTS
<- archive line ONLY if a new-minor archive was performed>
```

## Step 8 — Push and open the PR

1. `git push origin dev`.
2. Open a PR `dev` → `main` with `gh pr create`:
   - Title: `Release v$ARGUMENTS`
   - Body: this release's CHANGELOG section (the `[$ARGUMENTS]` block you just
     rolled), so the PR description is the release notes. This is the same
     text `/release-cut` will use as the GitHub release body — single source
     of truth.
3. Capture the PR URL.

## Step 9 — Report and STOP

Print a short summary:

- The PR URL.
- Confirmation that local validation passed.
- The exact next steps for the human, verbatim:
  1. Review the PR on GitHub and wait for CI to go green.
  2. Merge the PR into `main`.
  3. Wait for the push-to-`main` build to publish `:latest` to ghcr.io.
  4. Run `/release-cut $ARGUMENTS` to tag and publish the GitHub release.

Do NOT proceed past this point. Do not merge. Do not tag.
