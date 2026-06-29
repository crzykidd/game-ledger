# Decisions log

Non-obvious decisions made during execution, **newest at top**. Upfront scoping decisions live
in `docs/decisions-needed.md`; this log captures choices made while building.

## 2026-06-28: Release tooling adoption (prompt 47)

### Canonical version source — root `package.json` "version" (bare semver)

`package.json` `"version"` at the monorepo root is the single source of truth. Stored bare
(`0.1.0`, no `v` prefix) per the `release-prep-and-cut` standard. The three workspace
`package.json`s (`backend/`, `frontend/`, `packages/contract/`) are kept in sync manually at
each `/release-prep` bump — the command updates all four in one step.

Rejected alternatives: a separate `VERSION` file (extra file with no ecosystem tooling benefit)
and embedding the version in a TypeScript constant (hardcodes a second copy that diverges).

### In-app version display — dual approach (backend endpoint + build-time constant)

**Backend:** `VersionService` reads the backend's own `package.json` at runtime (two-candidate
path resolution: `dist/../package.json` in prod, `src/version/../../package.json` in ts-jest).
Exposed at `GET /api/version` as `{ version: string }` — public endpoint, no auth guard,
consistent with the health endpoint pattern. Provides a live machine-readable source of truth.

**Frontend:** `__APP_VERSION__` is injected at build/test time by Vite's `define` from
`frontend/package.json` (which stays in sync with root). Zero runtime overhead, no extra API
call. Rendered as a subtle `v{version}` text in the AppShell page footer. Declared in
`frontend/src/vite-env.d.ts`.

Rejected: fetching from the backend `/api/version` at runtime in the frontend — adds a
network dependency and state management for a display-only concern. The build-time constant is
sufficient since a version bump always triggers a rebuild.

### Release commands installed in `.claude/commands/`

`/release-prep` and `/release-cut` installed as `.claude/commands/release-prep.md` and
`.claude/commands/release-cut.md` with all template placeholders filled for this project.
The `CLAUDE-snippet.md` is pasted verbatim into `CLAUDE.md` with the gitea URL de-linked
(standard referenced by name + version: `crzynet/homelab-configs standards/release-prep-and-cut
@ v1.1.0`) — the repo is public and gitea is retired.

## 2026-06-28: In-app "Give feedback → GitHub issue" feature design (prompt 45, plan only)

Design pass for the v0.1.0 feedback feature: a global button captures an html2canvas
screenshot + a note, always saves it to an in-app admin inbox, and best-effort files a public
GitHub issue (with the screenshot embedded) in `crzykidd/game-ledger`. No code written in this
prompt — decisions below drive the build prompts 46 (backend) and 47 (frontend).

**1. Screenshot → GitHub issue mechanism — Contents API to a dedicated asset branch.**
GitHub's REST API has no public "attach image to issue" endpoint (the web UI uses a private
`uploads.github.com` route). Chosen approach, all over the public REST API with native `fetch`
(Node 24 → no HTTP dep, no Octokit):
  1. Ensure the asset branch exists (one-time, lazy): `GET /repos/{o}/{r}/git/ref/heads/{base}`
     for the base sha, then `POST /repos/{o}/{r}/git/refs` with
     `{ ref: "refs/heads/feedback-assets", sha }` (ignore 422 "already exists").
  2. Upload the PNG: `PUT /repos/{o}/{r}/contents/feedback/{feedbackId}.png` with
     `{ message, content: <base64>, branch: "feedback-assets" }`. The response's
     `content.download_url` is the raw URL.
  3. Create the issue: `POST /repos/{o}/{r}/issues` with the body embedding the raw URL as
     `![screenshot](https://raw.githubusercontent.com/{o}/{r}/feedback-assets/feedback/{id}.png)`
     plus reporter, route, module id+maturity, category, and the user's text.
`raw.githubusercontent.com` images **do render** inline in issue markdown for public repos
(must be verified live — see risks). The dedicated `feedback-assets` branch keeps `main`'s
history clean. **Downside:** images accumulate on that branch with no cleanup (deferred to a
nice-to-have pruning job). Rejected alternative: store the screenshot only in-app and link to
it — a homelab app URL is not reachable by external issue viewers, so the image would 404 for
maintainers.

**2. GitHub auth + config storage — write-only fine-grained PAT in a settings singleton.**
Reuse the maintenance settings *pattern* (singleton `upsert` row + audited update + SUPER_ADMIN
guard + an AdminMaintenance-style page), but in a **new singleton table** rather than overloading
`maintenance_settings` (feedback/integration config is semantically distinct). Fields:
`githubEnabled`, `githubRepoOwner`, `githubRepoName`, `githubAssetBranch` (default
`feedback-assets`), `githubToken`. The PAT is a **fine-grained token scoped to the one repo** with
**Contents: read/write + Issues: read/write**. Storage rules: the token column is **write-only —
never serialized in any API response**; GET returns a derived `githubTokenSet: boolean` instead.
Only **SUPER_ADMIN** may write the config (matches the restore-endpoint precedent). Token stored
as a plaintext column for now (it must be usable, so it cannot be hashed like session tokens);
optional encryption-at-rest via an env key is a documented hardening follow-up, not a 0.1.0
blocker. **Unconfigured / disabled / GitHub unreachable → feedback still saves in-app; no issue is
created and the save still returns 200** (best-effort, never fails the save).

**3. Data model — new `Feedback` table; screenshot as an in-DB `Bytes` blob.**
`Feedback`: `id` (cuid), `reporterUserId` (FK User), `route` (string), `moduleKey` (nullable),
`moduleMaturity` (nullable, auto-tagged), `category` (enum: bug | enhancement | question),
`text`, `screenshot` (`Bytes`, nullable), `screenshotMime`, `githubIssueUrl` (nullable),
`githubIssueNumber` (nullable Int), `status` (enum: OPEN | CLOSED, default OPEN), `createdAt`.
Screenshot stored **in-DB as `Bytes`** (not filesystem / not the backup dir): self-contained,
captured by `pg_dump` backups, no new volume mount, no path-traversal surface. Capped at ~2 MB
(client downscales; server rejects oversize). **Excluded from `MaintenanceService.exportAll`** so
the JSON export stays lean (blobs would bloat it). Filesystem storage is the documented scale-up
path. **Migration:** one new migration adding the `Feedback` table + the settings singleton +
two enums.

**4. API surface.**
  - `POST /api/feedback` — any logged-in user (AuthGuard + CsrfGuard), throttled. Body carries
    category, text, route, optional moduleKey/maturity, and the screenshot (base64 PNG in JSON,
    capped). Stores the row, then **best-effort** issue creation in a try/catch that logs and
    swallows failures. Returns `{ id, githubIssueUrl | null }`.
  - `GET /api/admin/feedback` (list) and `GET /api/admin/feedback/:id` (detail) — gated on
    `VIEW_ALL` (admins).
  - `GET /api/admin/feedback/:id/screenshot` — streams the PNG (admins).
  - `PATCH /api/admin/feedback/:id` — set status OPEN/CLOSED (admins).
  - `GET /api/feedback/settings` (returns config minus token, with `githubTokenSet`) and
    `PUT /api/feedback/settings` (SUPER_ADMIN) — modeled on the maintenance settings endpoints.

**5. Frontend.** A floating "Give feedback" button in `AppShell` (fixed bottom-right, all pages,
logged-in only). On click: **lazy-`import()` html2canvas** (keeps it out of the main bundle),
capture `#root`, render a modal with a screenshot **preview thumbnail**, category select, a
textarea, and a clear **"this will be posted publicly to GitHub and the screenshot may contain
on-screen data"** warning. Auto-tag `route` (from `useLocation`) and, on a `/play/:id` page, the
game's `moduleKey` + maturity. Submit → `POST /api/feedback`. New admin **"Feedback" tab**
(`ADMIN_TABS` + a `/admin/feedback` nested route, gated on `VIEW_ALL`): inbox list → detail with
the rendered screenshot, the text, and a link to the GitHub issue. **New dep:** `html2canvas`
(~40 KB gzip) — lazy-loaded so it doesn't grow the initial bundle. Known limits accepted: it
skips cross-origin images without CORS, doesn't capture CSS `backdrop-filter` (the frosted nav),
and may imperfectly render the SVG cribbage board — best-effort screenshot, not pixel-perfect.

**6. Security / abuse.** PAT is write-only + SUPER_ADMIN-only (above). `POST /api/feedback` gets a
dedicated `@Throttle` (≈5/min/user). Screenshot size capped (~2 MB) client- and server-side.
Only authenticated (invite-only, trusted) users can submit. **Public-exposure callout:** the
GitHub issue and its screenshot are publicly visible — the modal makes this explicit and shows the
exact screenshot before sending; the in-app save is always private regardless. The user opts in by
clicking, so nothing is auto-redacted.

**7. 0.1.0 cut line.** **In:** Feedback model + migration; `POST /api/feedback` with in-app save +
in-DB screenshot; AppShell button + html2canvas modal; admin inbox (list + screenshot view);
SUPER_ADMIN GitHub settings (write-only PAT, repo, branch); best-effort issue creation with the
embedded screenshot via the Contents-API/asset-branch flow; public-visibility warning; rate limit
+ size cap. **Deferred (nice-to-have):** category→GitHub-label mapping, issue dedup, status sync
back from GitHub, screenshot redaction tools, asset-branch cleanup/pruning, PAT encryption at rest,
filesystem screenshot storage for scale.

**Build split.** `46-feedback-backend` (sonnet): contract types, Prisma migration, `FeedbackModule`
(settings service, GitHub service via native fetch, feedback service, controller), throttling,
unit tests. `47-feedback-frontend` (sonnet): AppShell button, lazy html2canvas capture + modal,
api-client funcs, admin Feedback tab/route/inbox, SUPER_ADMIN GitHub settings section, tests; adds
the `html2canvas` dep. Order: 46 → 47 (frontend needs the API + contract types). A live
verification against the real public repo (confirm the screenshot renders in an actual issue) is a
required acceptance step folded into 47.

## 2026-06-28: GitHub Actions CI + ghcr.io publish workflows (prompt 44)

Authored `.github/workflows/ci.yml` (7 required PR checks) and `.github/workflows/publish.yml`
(image publish matrix + retention), both targeting the public `crzykidd/game-ledger` repo.

**7 CI checks (run on PR→main and push→dev/main):**
1. **Lint** — `pnpm -r run lint` across all workspaces.
2. **Config validation** — Python PyYAML parses all `modules/**/module.yaml` and
   `docker-compose*.yml`; Python json module validates all `*.json` files (node_modules/dist
   excluded).
3. **DB migration check** — Postgres 16 service; `prisma migrate deploy` onto a fresh DB;
   `prisma migrate status` asserts schema is at head with no drift.
4. **Compose config validation** — `docker compose -f docker-compose.yml config -q` and same for
   dev; validates compose YAML without starting containers.
5. **Image build (PR-only, no push)** — `docker/build-push-action@v5` with `push: false` for
   `backend/Dockerfile` and `frontend/Dockerfile`; gated on `github.event_name == 'pull_request'`.
6. **Test suite** — Postgres service + `prisma migrate deploy` + `pnpm --filter backend test`
   (jest) + `pnpm --filter frontend test` (vitest). Playwright e2e intentionally excluded.
7. **CodeQL SAST** — `github/codeql-action@v3`, `javascript-typescript` language pack; findings
   go to the Security tab, they do not auto-fail PRs.

**Publish matrix (push→dev/main, release published):**
- push `dev` → `:dev`, `:sha-<short>`
- push `main` → `:latest`, `:sha-<short>`
- release published (tag vX.Y.Z) → `:latest`, `:X.Y.Z`, `:X` (major)
- Two images: `ghcr.io/crzykidd/game-ledger-backend`, `ghcr.io/crzykidd/game-ledger-frontend`
  (confirms docker-compose.yml: `backend/Dockerfile` + `frontend/Dockerfile`; the compose `nginx`
  service reuses `frontend/Dockerfile`).

**Retention:** inline Python scripts after each publish call the GitHub Packages API to prune
`sha-*` tagged versions beyond 30 most recent and full-semver versions beyond 15 most recent.
Protected tags (`latest`, `dev`, bare major integers) are never deleted.

**Runners:** GitHub-hosted `ubuntu-latest` throughout. No custom runners or additional secrets
beyond the built-in `GITHUB_TOKEN`.

**CodeQL vs. Semgrep/Trivy:** CodeQL was chosen (over the earlier Gitea-era Semgrep/Trivy plan)
because CodeQL is natively supported on public GitHub repos without additional setup.

**e2e out of the gate:** Playwright requires the full stack (backend + DB + frontend). Keeping it
out of required PR checks avoids flaky infrastructure failures; it runs locally or as a separate
nightly workflow.

## 2026-06-28: Public GitHub repo — relocation, MIT license, CI pipeline adoption

Relocated to `crzykidd/game-ledger` on GitHub (public, MIT). Published as a fresh
"Initial public release" commit — no Gitea history carried over; the private Gitea is
retired. All private-infra links (Gitea server URLs, private admin email) removed from
tracked files.

`code-checkin-and-pr` is now **fully adopted**: `main` is PR-gated with required GitHub
Actions CI checks; `dev` remains the working branch. Surviving local deviations: no AI/Claude
mention in commit messages; agents commit directly on `dev` (one prompt → one commit). SAST
is via **CodeQL** (available on public GitHub), replacing the earlier Semgrep/Trivy plan
that was specific to Gitea Actions.

`release-prep-and-cut` adoption deferred to the release-pipeline prompt (to be implemented
with the GitHub Actions workflows).

## 2026-06-28: Cribbage promoted to `released`

First module promoted out of pre-release: `modules/cribbage/module.yaml` now sets
`maturity: released` (after the live-pegging rework). It is the only released game, so it's the
only one in the Start-New-Game picker's default (released-only) list; the rest stay pre-release
behind the "Show pre-release games" toggle.

## 2026-06-28: Module maturity reframe — released / pre_release (prompt 42)

### Default flips: missing maturity = pre-release

A module is `released` only when explicitly marked `maturity: released` in its YAML. Missing
maturity field (or `pre_release`) means pre-release. This is the opposite of prompt 38's
"missing = complete" default. No game is currently marked `released`.

### Enum renamed: in_dev/complete → pre_release/released

The schema enum in `packages/contract/src/module.schema.json` changed from `["in_dev","complete"]`
to `["released","pre_release"]`. The contract was rebuilt after this change.

### Picker default: released-only; "Show pre-release games" toggle reveals the rest

`StartGamePage` now filters the game `<select>` to show only `maturity === 'released'` modules
by default. A "Show pre-release games" checkbox (localStorage-persisted under
`gl-show-pre-release`) reveals pre-release modules with a `· Pre-release` suffix in their
option label. When no released games exist and the toggle is off, an empty-state hint is shown.

### Badge: "Pre-release" replaces "In Dev"

`GamePage` shows a `data-testid="pre-release-badge"` "Pre-release" pill whenever the loaded
module's `maturity !== 'released'` (including when the field is absent). A released module
shows no badge.

### All games currently pre-release

`modules/cribbage/module.yaml` had `maturity: in_dev` removed (no module is explicitly released
yet). E2E `startGameViaUi` helper now enables the pre-release toggle before selecting a game.

## 2026-06-28: Cribbage live pegging model (prompt 41)

### Each peg is its own round_score event

Replaced the "accumulate increments → Save Hand" model with live pegging: every +1/+2/+3
tap or typed-add submit immediately POSTs a `round_score` event with a single scorer and
the current `currentRound` counter. Round numbers are derived from the ScoreState at POST
time, so each peg lands as a unique event.

### End Deal = empty-scores marker, not a scoring event

"End Deal" posts `round_score` with `scores: []`. The deal number is computed as
`1 + count(rounds where scores is empty)` from the materialized ScoreState. This is purely
a rotation marker — no scores change.

### Per-peg undo via the existing undo-last-round endpoint

`POST /api/games/:id/undo-last-round` already deletes the highest round number and
re-materializes. No backend changes needed; the frontend calls it from the new
`handleUndoLast()` which replaces the old per-player undo dialog. The global "Undo last
peg" button in the capture panel is always enabled (even after a win) so mis-taps are
always recoverable.

### Win detection without auto-finish

After each peg, GamePage checks `totals[pid] >= target` for any participant. On a win the
capture panel is replaced by a win banner (`data-testid="win-banner"`) with the winner's
name, a Finish Game button, and an Undo button. "End Deal" is not required — the game ends
mid-deal the instant a player crosses 121. No auto-call to the finish endpoint; the user
must click "Finish Game" in the banner.

### Rear-peg derivation fix for interleaved scoring

The old rear-peg code used the global last round's delta, which gave zero (collapsing
rear=front) when the last peg belonged to a different player. The fix scans backwards
per-player for that player's own most recent non-zero delta. This is O(n) per player on
render but n (pegs in a game) is tiny.

### Cribbage board header shows Deal N

`GamePage` title bar shows `${name} — Deal ${currentDeal}` when `isCribbageLike`. The
global undo button in the header is hidden for cribbage-like games (the capture panel
provides undo instead, so two undo triggers would be confusing).

### Frontend-only change

No backend schema, DTO, or endpoint changes were made. The only backend dependency is the
existing `round_score` event and `undo-last-round` endpoint.

## 2026-06-28: Cribbage capture polish — +3 button, mobile-first add control, hide Running Totals (prompt 40)

### +3 quick button

Added a `+3` quick button alongside `+1`/`+2` in `CribbageCapture`. All three share identical
styling (`min-h-11 min-w-[3rem]`, border-indigo hover, `active:scale-95`). The pattern is
extensible — any crib scoring situation is reachable via the buttons + the typed add field.

### Mobile-first add control (no native spin arrows)

The numeric add field was `type="number"` which renders tiny spin arrows on desktop and no
arrows at all on mobile — making it ambiguous what the control does. Switched to
`type="text" inputMode="numeric" pattern="[0-9]*"`: no spin arrows anywhere, shows the
mobile numeric keypad, and still validates as an integer on parse. `step`/`min` attributes
removed (they only apply to `type="number"`). A global CSS rule in `ui.css` additionally
suppresses spinners on any `input[type=number]` that may exist elsewhere (WebKit +
Firefox). The explicit +1/+2/+3 buttons are the steppers; the field is for arbitrary
typed amounts (runs, show counts, crib).

### Running Totals hidden for games with a board

The `Running Totals` card in `GamePage` was already hidden for `rank_order` and
`winner_pick` games. Extended the condition to also hide when
`getBoardComponent(baseModuleId)` returns non-null — meaning the game has a visual board.
For cribbage, the peg board is the standings view, so a separate numeric totals table is
redundant and visually cluttered. Non-board numeric games (Skyjo, Uno, Hearts, etc.) are
unaffected.

## 2026-06-28: Cribbage hand-capture UI + capture registry + blank→0 (prompt 39)

### Capture registry

Introduced `frontend/src/play/capture/` as the **analogue of the presentation registry**.
`getCaptureComponent(moduleId)` returns a `React.ComponentType<CaptureProps> | null` from a
`CAPTURE_REGISTRY` dict keyed by bare module id. GamePage checks this before falling back to the
generic `ScoreForm`. Future games that need custom capture (e.g. trick-counting) add one line to
`CAPTURE_REGISTRY`.

`CaptureProps` is deliberately minimal: `participations`, `currentRound`, `saving`, `onSaveHand`.
The registry component never touches the event layer directly; it calls `onSaveHand(scores)` and
GamePage does the `postEvent` call as before.

### Buffered hand model

A "round" = one cribbage hand. Players build their hand total via +1/+2 quick buttons and a
numeric add field (for runs and show counts). "Save Hand" posts the existing `round_score` event
`{ round: currentRound, scores: { [participationId]: handTotal } }` — exactly what the generic
ScoreForm posted. Untouched players save 0.

Cribbage stays `numeric_rounds` (high/sum, target 121) with no new event type, no new scoring
type, no schema change. The board + resolver remain completely unchanged.

### Zero-persistence dealer/crib derivation

Dealer of hand N (1-based) = participant at seat index `((N-1) mod playerCount)`. Derived purely
from `currentRound` (which the board already tracks via ScoreState rounds count). Crib owner =
dealer. Advances automatically on Save Hand. No override UI in v1; noted as a future
enhancement.

### Blank → 0 in generic ScoreForm

`allFilled` now accepts blank as valid (blank coerces to 0 on submit). A blank `type="number"`
input means "this player scored 0 this round" — saves cleanly without typing "0". The existing
partial-negative check (`'-'` alone) is moot because browsers store `''` for incomplete number
input, which is now valid. Test 14b was updated to reflect this behavior change.

### CribbageCapture state reset on remount

GamePage uses `key={currentRound}` on the capture component (same pattern as ScoreForm). When
Save Hand completes and `currentRound` increments, the component unmounts and remounts with a
clean increment stack — no extra reset logic needed.

## 2026-06-28: Module maturity classification + "In Dev" badge (prompt 38)

Added `maturity?: 'in_dev' | 'complete'` as an optional field to `module.schema.json` (enum-
constrained). Missing maturity field means **complete** — the existing 17 modules stay unbadged
and unmodified. Only `in_dev` triggers UI treatment.

**Cribbage** is the first in-dev module (`maturity: in_dev` in `modules/cribbage/module.yaml`).

UI surfaces:
- **StartGamePage picker** — appends `· In Dev` to the `<option>` text for in-dev modules
  (no styled badge possible inside `<option>`).
- **GamePage header** — renders an amber `<Badge variant="warning">In Dev</Badge>` (from the
  existing Badge component) next to the game title when `moduleInfo.maturity === 'in_dev'`.
- History and dashboard pages are out of scope for this prompt.

Backend: `maturity` flows through `GET /api/modules` automatically via the `[key: string]: unknown`
index signature and `...mod` spread in `listModulesWithPlayCounts` — no backend code change needed
beyond the YAML.

## 2026-06-28: e2e suite migrated to new start-game UX (prompt 37)

All 10 specs that drove the old start-game flow (`getByRole('radio', …)` + checkbox list) were
updated to the new UX: `#game-select` dropdown → player-count button → `#slot-N` seat selects.
A shared `startGameViaUi(page, moduleId, playerNicknames)` helper was added to `e2e/helpers.ts`
to keep specs DRY. The helper navigates to `/play/new`, selects the module, clicks the count
button matching `playerNicknames.length`, fills each seat select in order, and asserts the URL.

`picker-cancel-delete.e2e.ts` test 1 also replaces the old radio `aria-checked` assertions with
new-UX equivalents: `#game-select` value empty before selection, count buttons visible after
selection, Start button disabled until count + seats filled.

Cribbage now has a committed happy-path spec (`g-cribbage-happy-path.e2e.ts`). The one-off
screenshot calls and dark/light-mode toggle code (added during visual verification) were removed;
the game-start section was refactored to use the shared helper.

Full suite: **20 tests, 0 failures**.

## 2026-06-27: Cribbage board — presentation registry (prompt 36)

**Presentation registry introduced as `frontend/src/play/presentation/index.ts`.**
`getBoardComponent(moduleId: string)` returns a `React.ComponentType<BoardProps> | null`
keyed by bare module id (no `@version` suffix). This is the first per-game visual treatment.
Future modules add one line to `BOARD_REGISTRY`; the `BoardProps` contract is minimal
(`participations`, `target`) so no data-pipeline changes are needed.

**Board is display-only SVG.** No changes to score entry, the scoring engine, or any backend code.
The board reads `scoreState.payload.rounds` and `scoreState.payload.totals` already present on each
`Participation`, exactly as `TotalsTable` does.

**Two-peg leapfrog derived from `totals` + last-round delta.**
- Front peg (filled circle) = `totals[pid]` — current score.
- Rear peg (hollow circle) = `totals[pid] - lastRound.scores[pid]` — score before this hand.
- Rear peg suppressed when `rearScore === 0` (start of game or after first hand).
- Both pegs absent until the first hand is scored.
Front peg animates via Framer Motion `motion.circle` with a spring transition (skipped when
`useReducedMotion()` is true).

**Skunk lines at 61 and 91, finish at 121** — rendered as dashed vertical lines with labels
crossing all player tracks. The `target` prop drives the finish line; hardcoding 121 was avoided
so the board could in principle serve other target values.

**GamePage strips `@version` suffix** before the registry lookup:
`game.moduleKey.split('@')[0]` → base id. The board renders above the Running Totals card; the
score-entry form and TotalsTable remain intact for cribbage (board augments, does not replace input).
For all non-cribbage modules `getBoardComponent` returns `null` and GamePage is unchanged.

## 2026-06-27: Cribbage game module (prompt 35)

Cribbage ships as `numeric_rounds` `direction: high` / `aggregate: sum` — no new scoring
engine code needed. Target is **121** (advisory; the UI finalizes the game when the scorekeeper
presses "complete"). `finishRound: false` because cribbage is won the instant a player crosses
121, potentially mid-hand.

**Player range: 2–3.** No partnership (team) play — each player tracks their own score. For
3-player games the dealer rotates left each hand.

**Single field: `roundScore` (integer, required).** Players enter one number per hand equal to
their total points that hand (pegging + counting). No `endedRound` field (that is Skyjo-only).

**Skunk lines (91 / 61) are metadata only** — they are surfaced visually by the board (prompt 36)
and described in `info.scoring`; there is no engine enforcement.

## 2026-06-27: Start-New-Game UX — dropdown + count buttons + slot grid (prompt 34)

**Game selector replaced with a sorted `<select>` dropdown.** The old radiogroup of game cards
does not scale as the module library grows. The dropdown sorts options most-played-first (by
`playCount` from the backend, prompt 33), then alphabetically as the tiebreak. A placeholder
option ("— Select a game —") ensures no default selection.

**Participant picker replaced with count buttons + seat-slot grid.** The old checkbox list plus
drag-to-reorder was removed. Instead: once a game is selected, a row of toggle buttons covers
its `players.min`–`players.max` range. Clicking a count N shows N `<select>` dropdowns (Seat 1,
Seat 2, …) in a responsive 1–2 column grid. Each slot excludes players already chosen in other
slots (no double-seating). Slot order defines seat order; the ordered array is passed directly
to `createGame({ participantPlayerIds })`. The `@dnd-kit` imports were removed from
`StartGamePage.tsx`; `GamePage.tsx` still uses `@dnd-kit` for the rank_order finish-order UI,
so the packages are NOT uninstalled.

**Playgroup pre-fill clamps to game range.** Selecting a playgroup auto-sets the count to the
group's member count clamped to the game's min–max, and fills the slots in membership order.
Clearing the playgroup empties the slot values (count is preserved so the user can reassign
manually). The playgroup and count-button sections only appear after a game is selected.

**Validation tightened.** Start is enabled only when a game is selected, a count is chosen, and
every seat slot has a distinct player assigned.

## 2026-06-27: Per-user play count on GET /api/modules (prompt 33)

**`playCount` field added to every module object returned by `GET /api/modules`.**
Each element in the response array now includes `playCount: number` — the count of games
the authenticated user has hosted (created) for that module. Modules with no hosted games
report `0`. All existing fields are untouched (additive change only).

**"Hosted" is defined as `Game.createdById === user.id`.** The field name is `playCount`
and it counts games where the caller is the creator (host), not just a participant. This
matches the prompt-34 use case: sort the start-game picker most-played-first from the
current user's perspective as the person who will host the next game.

**A single `groupBy` query rolls up versioned `moduleKey`s to the base key.**
`Game.moduleKey` may be stored as `skyjo@1` (versioned) rather than `skyjo` (base key).
`listModulesWithPlayCounts()` strips the `@version` suffix (`key.split('@')[0]`) before
summing counts, so all versions of a module roll up to the single `module.id` used as the
map key. This keeps the query to one round-trip and avoids needing a per-row split in SQL.

**Sort is not done server-side.** The endpoint returns modules in registry order with
counts. The frontend (prompt 34) sorts most-played-first then alphabetical. Server-side
sorting was considered trivially easy to add but deferred — the frontend must sort anyway
to implement the alphabetical fallback, so sorting twice would be redundant.

**No change to the `ModuleDefinition` interface; new `ModuleWithPlayCount` extends it.**
The existing interface is left intact so all callers of `listModules()` are unaffected.
The controller now calls `listModulesWithPlayCounts()` which returns `ModuleWithPlayCount[]`
(the parent type plus `playCount: number`).

## 2026-06-26: Maintenance admin UI — SUPER_ADMIN gating approach (prompt 32)

**SUPER_ADMIN-only controls (per-row Restore, Restore-from-upload) are hidden in the UI using
`user.role === Role.SUPER_ADMIN` from AuthContext, not by checking for a specific permission.**
The backend gates these endpoints on `Role.SUPER_ADMIN` (not a permission), so the UI mirrors
that exact check. An alternative of inventing a pseudo-permission or checking an additional
permission flag was rejected — the backend contract is the source of truth and the check should
match it exactly. The backend remains the real gate; the UI hide is UX-only friction reduction.

**Download links (backup download, JSON export) are plain `<a href="..." download>` anchors, not
apiClient calls.** Both endpoints return `Content-Disposition: attachment` file streams. Triggering
them via `fetch`/apiClient would require blob handling and a synthetic click; using a direct anchor
achieves the same user experience with less code and works naturally across browsers. CSRF is not
required on GET endpoints; cookie auth is still sent because the link is same-origin.

**Restore-from-upload uses a raw `fetch` call with a manually read CSRF cookie (not apiClient).**
`apiClient.post` serialises the body as JSON with `Content-Type: application/json`. The restore
endpoint requires `multipart/form-data` with a `file` field; using `FormData` directly and letting
the browser set the boundary is the correct approach. The CSRF token is manually extracted from
`document.cookie` using the same pattern as `ApiClient.getCsrfToken()`.

## 2026-06-26: Maintenance module — VACUUM/REINDEX on demand + scheduler (prompt 31)

**Shell out to `psql` for VACUUM and REINDEX (not Prisma `$executeRaw`).** Both `VACUUM` and
`REINDEX` cannot run inside a transaction block. Prisma's `$executeRaw` wraps statements in an
implicit transaction, which causes `ERROR: VACUUM cannot run inside a transaction block`. The fix
is to shell out to `psql` (already in the backend image since prompt 28) using the same
`ExecRunner` abstraction (`execFile` + args array) already used for `pg_dump`/`pg_restore`. This
keeps injection safety (DATABASE_URL is a discrete arg, never interpolated into a shell string)
and keeps the implementation testable (ExecRunner is injected and mocked in unit tests).

**Single audit action `maintenance.reindex` for both vacuum and reindex kinds.** The `kind`
metadata field (`vacuum` or `reindex`) distinguishes the two operations in the audit log. A
separate `maintenance.vacuum` action was considered but rejected — the pair are closely related
maintenance ops; a single action with a metadata discriminator is simpler for log queries. The
action name `maintenance.reindex` is the canonical key (the scheduled job runs both; the
on-demand endpoint runs either one).

**MANAGE_GLOBAL_SETTINGS gate (not SUPER_ADMIN) for on-demand maintenance.** VACUUM and REINDEX
are operational tasks, not destructive data changes. Restore (`pg_restore`, which overwrites all
data) is gated to SUPER_ADMIN because it is irreversible and catastrophic. Maintenance ops can be
slow but are safe to run at any time; blocking them at ADMIN level creates unnecessary friction.
The class-level `MANAGE_GLOBAL_SETTINGS` guard (inherited from the maintenance controller) is
sufficient.

**Scheduled reindex job runs both VACUUM ANALYZE then REINDEX.** When the cron fires, it runs
both operations sequentially — vacuum first (faster, updates stats), then reindex (rebuilds
indexes). This means the `reindexEnabled`/`reindexCron` setting covers a full maintenance window.
On-demand runs can target either operation individually for flexibility.

**`MaintenanceKind` type exported from `packages/contract`.** The `'vacuum' | 'reindex'` union
type is exported from the shared contract package so that the frontend (prompt 32) can import it
directly without copy-pasting the type. The `RunMaintenanceDto` in the backend uses the same type
via `@IsIn([...])` validation.

## 2026-06-26: Maintenance module — scheduling and retention (prompt 30)

**Dedicated `MaintenanceSetting` singleton vs. overloading `GlobalSetting`.** A separate model
keeps concerns isolated: `GlobalSetting` is for app install state; `MaintenanceSetting` is for
operational configuration. This also makes the migration boundary clean (no risk of conflicting
with app-wizard logic) and makes prompt 31 (reindex cron fields, already reserved) easy to extend.

**Dynamic cron via `SchedulerRegistry`, not static `@Cron()` decorator.** The schedule is
user-configurable at runtime. A static `@Cron()` decorator is fixed at compile time. Injecting
`SchedulerRegistry` and calling `addCronJob` / `deleteCronJob` allows `syncSchedules()` to swap
jobs dynamically after a `PUT /settings`. This is the recommended pattern from `@nestjs/schedule`.

**`syncSchedules()` extension point for prompt 31.** The method has a clearly commented stub
block for the `reindexEnabled`/`reindexCron` pair. Prompt 31 fills in that block without
rewriting the method. The `reindexEnabled` and `reindexCron` fields are already stored and
returned in `MaintenanceSettings`.

**Retention semantics: keep the N newest, prune the rest.** `pruneBackups(n)` sorts backups
newest-first (by `birthtime`/`mtime`), keeps the first `n`, and deletes the remainder. `n=0`
means keep all (never prune). Pruning is called after every backup — both scheduled and manual
— so the count is bounded by the configured limit automatically.

**Malformed stored cron is logged and skipped, never throws at boot.** `syncSchedules` wraps the
cron validity check in a try/catch and logs a `WARN`. This prevents a bad value in the DB from
crashing the backend on start. The `validateCronExpression` helper still throws `BadRequestException`
when called from `updateSettings`, so invalid crons are rejected at write time.

**System actor for scheduled runs: `actorUserId=null`, `metadata.source='schedule'`.** Scheduled
backups have no human actor. Using `null` for `actorUserId` matches the `AuditLog` schema (nullable
FK) and is consistent with how other system actions are logged. The `source: 'schedule'` metadata
field distinguishes automated runs from manual ones in the audit log.

## 2026-06-26: Maintenance module — JSON export (prompt 29)

**Session and Token tables excluded entirely.** Both tables contain secret hashes (`Session.tokenHash`,
`Token.tokenHash`). Including them with the hash stripped would still leak metadata (session timings,
token targets) without any utility for a game-history export. Simplest safe choice: exclude both tables.
The exported data is sufficient to reconstruct game history without them.

**`User.passwordHash`, `failedLoginAttempts`, and `lockedUntil` stripped from User rows.** `passwordHash`
is an obvious secret. `failedLoginAttempts` and `lockedUntil` are lockout-state fields that reveal
security posture and have no game-history value. All other User fields (id, email, nickname, role, state,
themePref, timestamps) are retained — they link players to user accounts and are needed for export
completeness.

**`PrismaService` added as the 3rd constructor arg (between `ConfigService` and the optional
`ExecRunner`).** Since `PrismaModule` is `@Global()`, NestJS injects `PrismaService` automatically
without touching `MaintenanceModule`'s imports. The optional `ExecRunner` and `FsAdapter` shift to
4th/5th args; test callers pass a mock prisma object in the 3rd position.

**BigInt replacer on `exportAll` + static `jsonReplacer` method.** `main.ts` already patches
`BigInt.prototype.toJSON` globally for normal controller responses. `exportAll` builds a plain object
and `GET /export` serializes it with `JSON.stringify(snapshot, MaintenanceService.jsonReplacer)` for
explicit belt-and-suspenders safety — the replacer converts `bigint` → `string` without relying on
the prototype patch, which may not run in test contexts.

**Decimal score serialized via `.toString()` before inserting into the export object.** Prisma returns
`score` as a `Decimal` object (not a JS number). Calling `.toString()` in `exportAll` before the
snapshot is assembled means the replacer doesn't need a Decimal-specific branch and `JSON.stringify`
sees a plain string. This avoids precision loss that would occur if `Decimal` were coerced to a JS float.

**v1 buffers all rows in memory.** For a household-scale game tracker the full dataset easily fits in
memory. A cursor/streaming approach (batch reads → temp file → `StreamableFile` pipe) would be the
upgrade path if `game_events` grows very large. A code comment in the controller notes the tradeoff.

## 2026-06-26: Maintenance module — DB backup/restore (prompt 28)

**pg_dump/pg_restore in the backend image, not from the db container.** The alternative is to
`docker exec` into the db container or use the Postgres host's own tools. Shelling into the db
container requires Docker socket access (security risk) or a sidecar. Running the pg client
tools inside the backend image keeps the backup logic entirely within NestJS where it can be
auth-gated, audited, and unit-tested. The trade-off is a slightly larger backend image (the
`postgresql16-client` package), which is acceptable for a self-hosted app.

**Fixed `/backups` container path with host-configurable bind for NFS.** The backend always
uses `BACKUP_DIR=/backups` (container-internal). The host side is `BACKUP_HOST_DIR` (default
`./private_data/backups`), which can be set to any absolute path or NFS mountpoint without
changing any backend code. This decouples the backup storage location from the application.

**execFile with args array, never shell-string interpolation of DATABASE_URL.** `DATABASE_URL`
may contain special characters (passwords, query params). Using `execFile` with an args array
prevents any shell expansion or injection. This is enforced in both `pg_dump` and `pg_restore`
calls and verified in the unit tests.

**SUPER_ADMIN gate on restore, MANAGE_GLOBAL_SETTINGS for list/create/download/delete.** Listing
and creating backups requires MANAGE_GLOBAL_SETTINGS (granted to SUPER_ADMIN + ADMIN by default).
Restore is SUPER_ADMIN-only because it overwrites all current database data — an irreversible
action that must not be delegatable to ADMIN role.

**Backup filename regex `^gameledger-[0-9TZ:-]+\.dump$` as the path-traversal guard.** The
regex ensures only files with the exact naming pattern (timestamp-based, no slashes) can be
referenced by name in API calls. An additional `path.resolve()` + prefix check provides
belt-and-suspenders protection.

**Temp-file cleanup in `restoreFromUpload` uses finally, not then.** If `pg_restore` throws,
the finally block still unlinks the temp file. The original error propagates normally (the
cleanup swallows its own errors silently to avoid masking the pg_restore failure).

**Multer `diskStorage` to os.tmpdir() for upload restore.** Writing the upload to a temp file
before passing it to pg_restore avoids holding the entire dump in memory. The temp file is
removed immediately after restore (or on failure). The 500 MB file size limit can be adjusted
in the controller if needed.

## 2026-06-26: Undo last round — hard-delete vs. compensating event (prompt 27)

**Approach: hard-delete the latest scoring event, re-materialize ScoreState.**

**Why truncation instead of a compensating event:**
- The spec calls the write model "append-only" in the context of multi-editor safety — the
  append-only invariant prevents lost-updates and supports event replay/sync across devices.
- In Phase 1 (single scorekeeper), there are no concurrent writers. Deleting the last event is
  semantically equivalent to a compensating event: the materialized ScoreState is re-derived from
  the remaining events in both cases.
- A compensating/tombstone event would require the replay logic to understand and skip tombstoned
  rounds — adding complexity everywhere state is computed. Hard-delete is simpler and produces
  identical results.
- The replay model (`updateScoreState` already loads all events and recomputes from scratch)
  means the materialized state is always correct after any event deletion.
- **Future multi-editor:** if Phase 2 adds concurrent writers, this endpoint should be revisited —
  either add compensating events, or require the undo to be fast enough that no concurrent event
  can race with it (e.g., lock the game row during the delete).

**Endpoint:** `POST /api/games/:id/undo-last-round` (creator-only, CsrfGuard, 403 for others).

**What it undoes:** finds the highest round-number `round_score` or `winner_pick` event and
deletes it, then re-materializes ScoreState. Returns `{ undone, version, scoreStates }`. Safe
no-op if no scoring events exist (returns `undone: false`). rank_order games are skipped (undo
is just re-submitting the finish order, which already works).

## 2026-06-26: Base-level game module batch (prompt 26)

**11 new pure-data YAML modules added** — all use existing scoring types with no new backend code:

**numeric_rounds / low-wins:**
- **Hearts** — penalty-point total, ends at 100, 3–6 players. Shoot-the-moon not modeled; the
  module's `info.scoring` instructs the scorekeeper to enter adjusted scores manually (0 for
  shooter, +26 for each opponent). The app tracks a running total of entered values — correct
  gameplay results depend on correct manual entry.
- **Phase 10** — penalty points for cards left in hand per round, ends when a player finishes all
  10 phases (scorekeeper ends the game manually via `game_defined`). The app tracks penalty point
  totals; which phase each player is on is tracked separately by the players using the physical
  phase cards.

**numeric_rounds / high-wins:**
- **Spades** — net round points (bid × 10 if made, −bid × 10 if set), first to 500. Bags (overtrick
  penalty, −100 per 10 bags) are not auto-tracked; the module's info note instructs the
  scorekeeper to apply the penalty manually in the round score if the group uses the rule. Nil/Blind
  Nil bonuses handled the same way.
- **Gin Rummy** — hand points per round (winner enters deadwood difference + gin/undercut bonus,
  loser enters 0), first to 100. End-game bonuses (box bonus, game bonus, shutout doubling) not
  auto-calculated; the module's info note instructs the scorekeeper to add them manually in the
  final round.
- **Crazy Eights** — round winner enters total points collected from opponents' leftover cards,
  all others enter 0; first to 100.
- **Yahtzee** — uses `aggregate: last` with `fixed_rounds: 1`, so the scorekeeper enters each
  player's final total from the physical scoresheet once the 13-category game is complete. Category-
  by-category tracking is not modeled. This is the intended base-level approach for a score-total
  game with complex internal structure.

**rank_order / finish-order:**
- **3UP 3DOWN** — shedding game, pure finish order, `game_defined` end.
- **Big Two** — shedding game, exactly 4 players, pure finish order, `game_defined` end.
- **Exploding Kittens** — elimination (last standing = rank 1), `game_defined` end (scorekeeper
  submits finish order after game ends). Uses `rank_order` not a dedicated `elimination` type
  because rank_order's finish-order UI is exactly right: the scorekeeper records who went out
  first through who survived last, top = winner.
- **Coup** — elimination bluffing game, same mapping as Exploding Kittens.
- **Liar's Dice** — elimination bluffing game, same mapping.

**Elimination games → `rank_order`, not `elimination` scoring type.** The module-contract doc
describes an `elimination` scoring type / capture mode, but it is not currently implemented
in the backend registry. `rank_order` covers the same use case for M1: scorekeeper records finish
order (first out = last rank, survivor = rank 1). The finish-order UI that President already uses
is reused identically. No new scoring type needed.

**Yahtzee end condition = `fixed_rounds: 1` not `game_defined`.** Yahtzee always ends after exactly
13 categories (one final total per player). Using `fixed_rounds: 1` with `aggregate: last` is
semantically clean: one "round" of entering the final total, highest wins. Considered `game_defined`
but rejected — Yahtzee IS a fixed-length game; `game_defined` implies unknown end, which is wrong.

**No modules skipped.** All 11 games in the prompt fit existing scoring types cleanly.

## 2026-06-26: winner_pick scoring type + Cards Against Humanity / Apples to Apples (prompt 25)

**Dedicated `winner_pick` scoring type, not a `numeric_rounds` alias.** The alternative was
to reuse `numeric_rounds` with the frontend emitting round scores (1 for winner, 0 for others),
avoiding a new scoring type. Rejected: `numeric_rounds` requires entering a score per player
every round; `winner_pick` semantically captures "pick one winner" — a meaningfully different
capture shape. Adding a dedicated type keeps the registry honest and matches the contract spec.

**Separate `WinnerPickScoringType` interface (parallel to `RankOrderScoringType`).** Like
rank_order, winner_pick uses a different resolve signature (`resolveWinnerPick(rounds,
config): ResolvedResult`). The standard `ScoringType.resolve(RoundEntry[][], config)` is not
appropriate — winner_pick rounds contain a `winnerId` field not a generic `roundScore`.
Keeping the three scoring families separate (numeric_rounds, rank_order, winner_pick) avoids
forcing all games into one awkward interface.

**`winnerPickRounds` key in ScoreState payload (not `rounds`).** The numeric_rounds state uses
`rounds: Array<{round, scores}>`. Winner_pick state uses `winnerPickRounds: Array<{round,
winnerId}>`. Using a distinct key prevents frontend code from accidentally misreading one
format as the other (both have a `totals: Record<string, number>` which is compatible).

**e2e test named `g-cah-happy-path.e2e.ts` (not `cah-happy-path.e2e.ts`).** Playwright runs
test files alphabetically. The `fresh-db-setup-gate.e2e.ts` test must run first (it seeds the
wizard on a fresh DB). A `cah-*` filename would sort before `fresh-db-*` and call
`runSetupIfNeeded()`, seeding the DB before the gate test could assert the "fresh DB" state.
Prefixed with `g-` to sort after `fresh-db-setup-gate`. The pattern follows `g-five-crowns-
happy-path.e2e.ts` already in the suite.

**Result: `numeric_total` (high-wins) for both modules.** Cards Against Humanity and Apples to
Apples both use `winner_pick` capture + `numeric_total` result, consistent with the catalog's
description ("degenerate case of archetype B"). The result page shows a Score column with
Awesome Points totals. The existing TotalsTable component is suppressed for winner_pick games
(the WinnerPickForm already shows running totals inline with each player button).

## 2026-06-25: Retired hand-rolled design system (prompt 24)

**Toast migrated to `components/ui/Toast.tsx`** — same `ToastProvider`/`useToast` API, Tailwind-styled with left-colored border variant. Replaces CSS classes `toaster`, `toast`, `toast--{type}`, `toast__message` with Tailwind utilities.

**Spinner migrated to `components/ui/Spinner.tsx`** — same `Spinner`/`SpinnerProps` API, Tailwind `animate-spin` replaces the old `.spinner` / `.spinner--{size}` CSS.

**Theme util migrated to `frontend/src/lib/theme.ts`** — all four exports (`applyTheme`, `getCurrentTheme`, `initTheme`, `setThemePref`) and the `theme.test.ts` moved verbatim; system-resolves-to-explicit-`data-theme` behavior preserved.

**PlayLayout converted to use AppShell** — was using the old `AppBar`. PlayLayout is currently unused by the router (all pages render standalone with ProtectedRoute), but converted to use `AppShell` for consistency.

**`design-system/` folder deleted** — `components/` (AppBar, Button, Card, EmptyState, FormField, Modal, Spinner, Table, TextField, Toast), `tokens.css`, `styles.css`, and theme files all removed. Old CSS class names that serve as e2e test selectors remain in JSX markup (they're just hooks, not styled by deleted CSS).

**`tokens.css` / `styles.css` removed from `main.tsx`** — Tailwind's preflight + component styles now handle all base styles. Dark mode continues to work via `data-theme` attribute + Tailwind `dark:` variant.

**Play screens had to be finished off in Tailwind when the CSS was removed.** The prompt-22
note claimed the converted play screens kept old design-system class names *alongside* Tailwind
classes. In practice several elements carried **only** the old class names (no Tailwind) and
relied entirely on `styles.css` for their visual styling — so deleting the CSS left them
unstyled (cramped stat blocks, plain filter tabs, unstyled module-picker rows, broken score
steppers/inputs, etc.). Per the prompt ("if removing old CSS breaks a converted screen, fix it
with Tailwind — don't re-add the old CSS"), the affected elements in `HistoryPage`
(`history-stats*`, `filter-tabs*`, `history-card*`, `status-badge*`), `StartGamePage`
(`module-picker-card*`, seat list, the playgroup `<select>` that used `form-field__input`),
`GamePage` (`game-header*`, `score-sheet*`, `totals-table*`, `ended-round-toggle*`,
`wild-rank-hint`, score steppers/inputs, finish-order seat list, the `skyjo-reference` panel),
`ResultsPage` (`results-table*`), and `SkyjoReference` (`collapsible*`, `skyjo-ref__list`) were
restyled with inline Tailwind composed via `cn()`. **All old class names were kept** (they're
e2e/unit-test selectors). No CSS file was re-added. Verified with dark-mode screenshots of every
screen.

## 2026-06-25: Players and admin screens converted to new UI foundation (prompt 23)

**Replaced design-system Table with inline Tailwind tables.** The old `Table<T>` component
used a generic `columns` + `rows` API. Replaced with plain `<table>` markup using Tailwind
for each admin screen — simpler, no generic typing tricks, direct control over cell rendering.

**Replaced design-system Modal with `components/ui/Dialog`.** All admin modals (AdminInvites,
AdminGroups, AdminUserDetail, AdminResets) and PlayersPage modals now use the new Dialog.
The Dialog preserves `role="dialog"` for e2e selector compat (`page.getByRole('dialog')`).

**Replaced design-system Spinner with inline spinner div.** Each screen now uses an inline
`<div className="... animate-spin" aria-hidden />` instead of importing Spinner. Consistent
with the play-screen approach.

**Replaced design-system TextField with labeled `<input>` + `<label>` pairs.** Used explicit
`htmlFor`/`id` pairing to preserve `getByLabelText()` test selectors. Error messages rendered
below the input as `<p>` elements.

**PlayersPage converted to AppShell + new Card/Dialog primitives.** Old design-system AppBar,
Card, Modal, TextField, EmptyState and Spinner removed. Player rows and playgroup rows replaced
with Tailwind flex layouts. Empty states replaced with inline icon + text divs.

**AdminLayout loading state uses AppShell wrapper.** The loading spinner is wrapped in AppShell
so the nav is visible during auth resolution (avoids layout flash).

**Toast kept from design-system in all converted screens.** Per the task spec, the shared
Toast/ToastProvider stays as-is; it ships in the next cleanup step.

## 2026-06-25: Play screens converted to new UI foundation (prompt 22)

**Kept design-system CSS class names as selectors while switching shell.** The e2e and unit tests
depend on classes like `.score-sheet`, `.totals-table__row--leader`, `.results-table__row--winner`,
`.history-card`, `.status-badge--complete`, `.filter-tabs__tab`, `.game-header__title`,
`.wild-rank-hint`, `button.ended-round-toggle`, `.skyjo-reference`, etc. These are defined in
`design-system/styles.css` and preserved in the JSX markup alongside Tailwind classes. Preflight is
OFF so both coexist without conflict.

**`Dialog` added to `components/ui/`.** The play screens use modals for Finish/Cancel/Delete
confirmations. Instead of continuing to import the design-system `Modal`, a Tailwind-based
`Dialog` component (`src/components/ui/Dialog.tsx`) was created. It preserves `role="dialog"` and
`aria-modal="true"` so existing test selectors (`page.getByRole('dialog')`) continue to work.

**`loading` prop added to new `components/ui/Button`.** The play screens need loading spinners on
submit/save buttons. The prop was added to `Button.tsx` (inline spinner via CSS animate-spin),
overriding the prior decision that auth screens did not need it. The implementation is consistent
with the design-system `Button`'s `loading` behavior.

**Players and admin screens untouched.** Per the prompt instructions, `PlayersPage.tsx` and all
admin screens (`admin/`) continue to use the old `AppBar` + design-system components. Only the
four play screens use `AppShell`.

## 2026-06-25: Auth/account screens converted to new UI foundation (prompt 21)

**No shared `AuthPageShell` file — inline per screen.** Each auth screen (Login, InstallWizard,
AcceptInvite, PasswordReset) inlines a small `AuthPageShell` and `AuthInput` helper rather than
a shared file. This avoids adding a new file for 15-line helpers; the duplication is minimal and
the screens are cohesive.

**`h1` placement: card heading, not brand name.** The brand "Game Ledger" above the card is a
decorative `<p>` (visually styled as a heading). The page's semantic `<h1>` is the card title
("Sign in", "Accept Invitation", etc.). This was required by the e2e test
`locator('h1', { hasText: 'Accept Invitation' })` in `invite-flow.e2e.ts`. The same pattern
is applied consistently across all auth screens.

**Profile moved to `AppShell` (new nav) instead of old `AppBar`.** Profile is an authenticated
screen and logically lives inside the main app shell. It no longer imports from
`design-system/components/AppBar`. Other unconverted screens continue to use the old `AppBar`.

**No `loading` prop on `Button` — `disabled` + text change instead.** The new `Button` from
`src/components/ui/Button.tsx` does not expose a `loading` prop (it uses `disabled`). Auth
screens show a text change ("Signing in…", "Creating account…") plus `disabled={submitting}`.
The old design-system `Button` had `loading`; that variant is unused in the converted screens.

**`design-system/` Button/Card/TextField not touched.** Admin, play, and other unconverted
screens continue to import from `design-system/components/`. Only the 5 auth/account screens
switch to `components/ui/`.

## 2026-06-25: UI foundation promoted app-wide + Dashboard converted (prompt 20)

**Shared `src/components/ui/` replaces `src/preview/ui/`.** The prototype UI components
(Button, Card, Badge, Avatar, Skeleton, `cn()`) were copied to a canonical `src/components/ui/`
location and enhanced for dark-mode contrast. A new `SegmentedControl` component was added.
The `preview/ui/` originals remain as dead code for reference but are no longer imported.

**Tailwind content broadened from `preview/**` to `src/**`.** The Tailwind `content` array in
`tailwind.config.js` now scans the whole `src/` tree so the shared components and the
converted Dashboard are processed. `preflight` stays **off** — the hand-rolled
`design-system/styles.css` box-model reset must not be clobbered during the migration.

**Single shared Tailwind entry: `src/components/ui/ui.css`.** `preview.css` was replaced by
this canonical entry point imported once in `main.tsx`. The `preview.css` import inside
`PreviewDashboard.tsx` remains (dead code), but it is no longer reachable from any route.

**Dark mode strategy unchanged.** `darkMode: ['class', '[data-theme="dark"]']` in the Tailwind
config fires on `[data-theme="dark"]` on `<html>`. The `Dashboard` (and future converted
screens) live directly under `<html>`, so no MutationObserver indirection is needed —
`data-theme` on the root already applies.

**Dark mode contrast fixes applied.** Three pain points were addressed:
1. Card surface: `bg-white dark:bg-slate-800` (was `/90` opacity — now solid) with
   `border-slate-700` (was `/60`) and `shadow-md shadow-slate-950/60` for clear elevation lift.
2. Muted/secondary text: `dark:text-slate-300` (bumped from `slate-400`) for sub-text and
   secondary copy across game cards, stats strip, and empty states.
3. Segmented pills + badges: active pill uses `dark:bg-slate-700` with `border-slate-600/40`
   for visible separation; Badge `muted` variant uses `dark:text-slate-200` (was `slate-300`).

**`/preview` route removed + temp "View redesign preview" link removed.** The prototype is now
the production dashboard at `/`. The `PreviewDashboard` component is dead code — not deleted
yet in case a quick comparison is needed during the migration.

**`AppShell` built as shared frosted-navbar wrapper.** The component lives at
`src/components/AppShell.tsx`. It renders the scroll-driven frosted navbar (brand logo, desktop
nav links, theme toggle, user avatar/menu, mobile hamburger). Unconverted screens continue to
use `design-system/components/AppBar` — both coexist safely since they apply different CSS
classes.

**e2e selector migrated from CSS class to `data-testid`.** The `uno-happy-path.e2e.ts` test
used `.active-game-row__module` (a BEM CSS class from the old Dashboard). The new Dashboard
emits `data-testid="active-game-row__module"` on the module name span, and the test was updated
to `[data-testid="active-game-row__module"]`. The asserting behaviour is identical — only the
selector mechanism changed.

**Screenshots not captured — live stack credentials unavailable.** The e2e `.env.e2e.json`
creds file does not exist in the worktree. Visual verification must be done manually or via
a subsequent e2e run once the creds file is present.

## 2026-06-25: Dashboard redesign prototype foundation (prompt 19)

**Tailwind CSS v3 added with `preflight: false`.** Tailwind's base CSS reset (preflight) is
disabled in `tailwind.config.js` so it never touches the existing hand-rolled design system.
The `content` array is scoped to `./src/preview/**/*.{ts,tsx}` so Tailwind's generated CSS
only includes classes used in the new prototype — no unused utilities leak. PostCSS is wired
via `frontend/postcss.config.js` (ESM export).

**Tailwind CSS imported from a scoped entry file.** `frontend/src/preview/preview.css` is the
only file that imports `@tailwind base/components/utilities`. It is imported exclusively by
`PreviewDashboard.tsx`. The existing `design-system/styles.css` and `tokens.css` are untouched.

**Dark mode via `['class', '[data-theme="dark"]']`.** The existing app uses
`data-theme="dark"` on `<html>`. The preview root's `MutationObserver` mirrors the attribute
from `document.documentElement` onto the `.preview-root` wrapper div so Tailwind's `dark:`
variants fire inside the scoped component without polluting anything outside it.

**shadcn/ui-style components hand-coded in `frontend/src/preview/ui/`.** Rather than running
the shadcn CLI (which expects a full shadcn project setup), components were hand-authored in
the same shadcn idiom: Radix primitives + `class-variance-authority` CVA + Tailwind + `cn()`
helper. Components added: `Button`, `Card`, `Badge`, `Avatar`, `Skeleton`. This gives full
ownership without generator coupling.

**Framer Motion v12 strict type workaround.** Framer Motion v12 requires variant `transition.type`
to be a literal `AnimationGeneratorType` not a plain `string`. Fixed by importing `Variants`
from `framer-motion` and annotating all variant constants with it (TypeScript then widens the
literal type correctly).

**`motion.div` vs. HTML props conflict avoided.** Using `motion.div` as a `forwardRef` wrapping
`HTMLAttributes<HTMLDivElement>` causes a type conflict in Framer Motion v12 (`onDrag` event
signature mismatch). The `Card` component uses plain CSS transitions (`transition-all`, hover
`-translate-y-0.5`) instead of Framer Motion whileHover for the simple lift effect; Framer
Motion is used only on top-level interactive containers (`motion.div` with `variants`,
`whileHover`, `whileTap`) where we own the props directly.

**`/preview` is a protected route, not public.** Added under `<ProtectedRoute>` in the router
so the same auth guard protects it. A temporary "✨ View redesign preview" button was added at
the bottom of the existing `Dashboard.tsx` to make the route discoverable.

**Screenshots via Playwright with mocked API responses.** To avoid touching the live dev stack
(port 8088) and to capture from the compiled `dist/` (which has Tailwind pre-processed, unlike
the dev Vite container where `postcss.config.js` is not volume-mounted), screenshots were
captured using `vite preview` on port 7997 with `page.route('**/api/**')` interceptions
providing mock game data. Six screenshots captured: desktop/mobile × light/dark × `/preview`,
plus original dashboard light to confirm no bleed.

## 2026-06-25: Module picker UX, cancel game, delete game (prompt 18)

**Module picker redesigned as clickable cards (no default selection).** The old radio-inside-label
pattern auto-selected the first module (`mods[0].id`, which is `five-crowns` sorted
alphabetically), causing users to accidentally start Five Crowns games when they intended Skyjo.
New pattern: `role="radio"` buttons on styled cards; entire card is the click target; border
highlights on selection; aria-checked attribute for accessibility. `moduleKey` state initializes
to `''` (no selection); the "Start game" button remains disabled until both a module card AND a
valid participant count are chosen. Player range (e.g. "2–8 players") is shown on each card.

**Cancel game: ABANDONED status, not a delete.** `POST /api/games/:id/cancel` sets
`status = ABANDONED` and `endedAt = now()`. The game record is preserved for history. Creator
check is enforced server-side via `game.createdById !== actorId` → 403. Admins are NOT
automatically granted cancel rights — they would need an explicit permission check added later
if that use case arises. A dedicated endpoint (vs. a `PATCH /status`) makes the intent clear
and avoids accepting arbitrary status values from the client.

**Delete game: hard-delete + FK-safe cascade in a transaction.** `DELETE /api/games/:id` deletes
children in order: `gameResult → scoreState → gameEvent → participation → game`. Uses
`prisma.$transaction([...])` to make the cascade atomic. Same creator-only enforcement as cancel
(403 for non-creators). Admins not granted yet — log this for future review.

**Admin cancel/delete deferral.** Both cancel and delete are creator-only at M1. Granting admins
the same rights would require either (a) a new permission flag checked server-side, or (b) a role
tier check. Deferred — the server-side enforcement is clean enough to add later without breaking
the API surface.

**HistoryPage: Abandoned tab + badge.** Added 'Abandoned' as a fourth filter tab so users can
filter abandoned games separately. Abandoned games show a strikethrough `status-badge--abandoned`
badge and are not linked (no in-progress page to navigate to). The Delete button is visible on any
game card where `user.id === game.createdById`, regardless of status (creator can delete active,
complete, or abandoned games).

## 2026-06-25: Uno save-round fix (ScoreForm state reset between rounds)

Root cause: `ScoreForm` in `GamePage.tsx` had no `key` prop. React's `useState`
initializes once on mount; without remounting on each new round, `entries` state
retained round 1 values when round 2 began. The `allFilled` check evaluated to
`true` against stale entries, so the Save Round button was immediately enabled
for round 2 even before the user entered new values. In Uno (no `endedRound`
toggle to visually signal a reset), users would see old scores and click Save,
re-submitting round 1 values as round 2. Fix: added `key={currentRound}` to
`<ScoreForm>` so it remounts (and re-initializes state to empty strings) when
the round changes.

Also fixed: Dashboard and History pages showed "Skyjo" as the game name for
all games (hardcoded). Both pages now fetch `/api/modules` and build a
`moduleKey → name` map. HistoryPage also had an unconditional `<SkyjoReference>`
on the generic history listing — removed entirely. GamePage's conditional
`<SkyjoReference>` for Skyjo was replaced with the generic `<ModuleReference>`
(which reads `moduleInfo.info.scoring` from the YAML) — this is now the single
source of truth for per-game scoring reference text, driven by module metadata.

**President is now rank-only (pointsMap removed from the module YAML).** This
reverses the 2026-06-25 prompt-16 decision that President should ship with a
default `pointsMap` (3/2/0) and surface a Score column. Prompt 17 requires
President to present "rank-only results (no Score column)", matching the
catalog's framing that points are *optional* and rank-only must be first-class.
The `rank_order` scoring type **keeps** full `pointsMap` support in
`scoring-type.registry.ts` for future modules that do assign points by rank
(e.g. Tichu); only the President module instance drops it. With no pointsMap,
`resolveFinishOrder` yields `score: null` for all players, so `ResultsPage`'s
`isRankOnly` check hides the Score column. (The earlier prompt-16 notes below
about "Score column shows for President" are superseded by this entry.)

**InstallWizard auth fix (pre-existing flake, surfaced by the e2e suite).** The
wizard imported the raw `login` from `api/auth`, which sets the session cookie
but never updates `AuthContext.user`. After `navigate('/')`, the route guard
read a still-null context user and bounced to `/login` — the `fresh-db-setup-gate`
auto-login e2e was failing on this. Switched the wizard to `useAuth().login()`,
which calls `apiLogin` then `loadUser()`, so the context is populated before
navigation. This was masked previously because the broken module-default (see
below) meant several e2e tests never reached a green baseline.

**Skyjo e2e test now selects its module explicitly.** `skyjo-happy-path.e2e.ts`
relied on Skyjo being the default selection on `/play/new`. The default is
`mods[0].id` (first module from `/api/modules`, ordered by directory scan —
`five-crowns` sorts first), so the test was silently starting a *Five Crowns*
game. The Skyjo test (and the President-file Skyjo regression sub-test) now
check the Skyjo radio button explicitly; the regression sub-test also uses
unique per-run nicknames so player checkboxes resolve unambiguously.

## 2026-06-25 — rank_order scoring type + President module (prompt 16)

- **`rank_order` uses a separate `resolveFinishOrder()` interface, not the existing `ScoringType.resolve()`.** The `numeric_rounds` type takes `RoundEntry[][]` (2D array of numeric rounds). `rank_order` takes `FinishOrderEntry[]` (a flat finish-order list). Forcing them into the same signature would require awkward type-narrowing or a wrapper shim. Instead, added `RankOrderScoringType` with `resolveFinishOrder()` and a parallel `getRankOrderScoringType()` registry lookup. The `GamesService` routes to the appropriate resolver at finish time based on which registry returns a hit. This keeps `result.type` and `capture.mode` independent axes as the design requires.
- **`finish_order` event type for rank_order games.** A `finish_order` event (`{ order: [{ participationId, rank }] }`) is the write-model primitive for rank_order capture, parallel to `round_score` for numeric games. `updateScoreState` was extended to handle this: the materialized `ScoreState.payload` for rank_order games stores `{ finishOrder: [...] }` instead of `{ rounds, totals }`. The frontend `postEvent` call sends type: `"finish_order"`, and after success the UI immediately calls `finishGame` (single-round M1 flow). Multi-round President is explicitly deferred.
- **Auto-finish after finish_order submission.** For M1 (single-round), the frontend calls `finishGame` immediately after a successful `finish_order` event, navigating directly to results. There is no separate "Finish Game" button for rank_order games. The "Finish Game" button is conditionally hidden when `scoringType.id === 'rank_order'`. Rationale: the finish-order IS the game end — there's nothing more to record. Future multi-round President would decouple these two steps.
- **Score column suppressed when `result.type === 'ranking'` AND all scores are null.** When no `pointsMap` is configured, `resolveFinishOrder` returns `score: null` for all participants, and `ResultsPage` uses `ranks.every(r => r.score === null)` to decide whether to render the Score column. When `pointsMap` is configured (e.g., President's 3/2/0), scores are non-null and the column appears normally. This keeps the same `RankRow` type for both cases — no schema branching needed.
- **President module includes optional `pointsMap` (3/2/0) in config.** The three-player pointsMap (`"1": 3, "2": 2, "last": 0`) is included by default to demonstrate the feature. The `"last"` key maps to the highest-numbered rank in the group, so it works for any player count 3–8. Middle ranks (e.g. neutral/citizen in a 4+ player game) without an explicit key get `score: null` by design.
- **Score column shows for President (pointsMap present), hidden only when all scores null.** The e2e verification confirmed this behavior: President results show the Score column with 3/2/0 values. The "no Score column" behavior is verified by the frontend unit test (Test 9) which passes `score: null` in the resolved ranks.
- **No changes to the JSON Schema were needed.** `scoringType.config` already uses `additionalProperties: true`, so `pointsMap` passes schema validation without any schema update. The module schema remains backward-compatible.
- **`RankEntry.score` changed from `number` to `number | null`.** The existing `numeric_rounds` type always produced a non-null score (total). `rank_order` produces `null` when no pointsMap is set. Updated the interface and all callers; `numeric_rounds` continues to return numbers, `rank_order` returns `number | null`.

## 2026-06-25 — Capture-driven score entry + Uno & Five Crowns modules (prompt 15)

- **Score entry renders from module metadata, not hardcoded fields.** Added `GET /api/modules`
  (`ModuleLoaderController`, auth-guarded, wraps the existing `listModules()`) so the frontend can
  fetch loaded module definitions. `GamePage`/`StartGamePage`/`ResultsPage` now drive their UI from
  the fetched `ModuleInfo` instead of assuming Skyjo. The score form shows the "Ended round" toggle
  **only** when the module declares an `endedRound: boolean` field (Skyjo has it; Uno/Five Crowns
  don't). Leader highlight + Final Rankings order + the "Low/High score wins" subtitle come from
  `scoringType.config.direction`. Header progress is `Round X of N` for `fixed_rounds` vs
  `Round X (target: N)` for `target`.
- **Per-round config carried as a top-level `perRoundConfig` array in the module YAML.** The module
  JSON Schema already allows `additionalProperties: true` at the top level, so Five Crowns' changing
  wild rank (3s→Kings over rounds 1–11) needed **no schema change** — it's pure data. The UI reads
  `perRoundConfig[currentRound]` and shows a "Wild this round: <rank>" hint above the form.
- **No engine changes needed for the two end conditions.** `numeric_rounds` already ranks by
  `direction` (high/low) and sums rounds; the existing `target` vs `fixed_rounds` handling is purely
  a display concern (the scorekeeper finishes the game manually either way). So Uno (high/target 500)
  and Five Crowns (low/fixed 11) are **pure data modules** — the only code was the generalization +
  the new `/api/modules` endpoint.
- **`endedRound: false` always sent in the round payload** when a module has no ender field, keeping
  the backend `RoundScorePayload` shape stable and backward-compatible (no migration).
- **Generic `ModuleReference` component** renders any module's `info.scoring` as a collapsible panel;
  Skyjo keeps its bespoke `SkyjoReference`. Verified all three games end-to-end in a real browser
  (Playwright/Chromium) with correct win-direction ordering; screenshots captured during verification.

## 2026-06-24 — UI polish, responsive nav, drag-to-reorder, icon library (prompt 14)

- **lucide-react chosen as icon library.** Lightweight tree-shakeable icon set, consistent with the hand-rolled design system philosophy. Used in nav, buttons, empty states, score entry.
- **@dnd-kit chosen for drag-to-reorder.** @dnd-kit/core + @dnd-kit/sortable is accessible, touch-friendly, and framework-agnostic. Up/down arrow buttons kept as keyboard/accessible fallback. Closes Gitea #2.
- **Responsive nav: CSS-only hamburger with React state toggle.** No third-party menu library — a `mobileOpen` state flag shows/hides a mobile drawer via CSS. The drawer overlays content and closes on nav or outside click.
- **EmptyState component added to design system.** Replaces scattered `<p style={{color: 'var(--color-text-muted)'}}>` empty state patterns across Dashboard, History, Players pages.
- **Dark mode: replaced hardcoded colors with CSS custom properties.** `.status-badge--active` color, `.totals-table__leader-badge`, and `.status-badge--active` background were hardcoded. Moved to tokens using `--color-success` and `--color-success-bg` pattern.
- **Password show/hide toggle inline in Login.tsx.** Rather than extending TextField (which would affect all text fields), the password toggle is implemented inline in Login.tsx as a relative-positioned wrapper with an absolute-positioned eye button. aria-label uses "Show"/"Hide" (not "Show password") to avoid ambiguity with `getByLabelText(/password/i)` in tests.
- **Shadow tokens added to design system.** `--shadow-sm/md/lg` added to tokens.css with stronger values for dark mode. Cards now use `--shadow-md`; app bar uses `--shadow-sm`.

## 2026-06-24 — Start-game bugs: modules mount, self-player, seat reorder (prompt 13)

**#3 — modules mount:** The module loader resolves `/app/modules` at runtime but `modules/` was never
mounted in dev or copied into the prod image. Fixed by adding a bind mount in `docker-compose.dev.yml`
(`./modules:/app/modules`) and a `COPY modules ./modules` in the Dockerfile runner stage.

**#1 — self-Player:** Users had no Player row so the participant picker couldn't find them. Strategy:
create a linked Player (`userId=user.id`, `nickname=user.nickname`, `createdById=user.id`) on every
user-creation path (setup wizard, invite-accept without guest binding). Added an `onApplicationBootstrap`
hook to `PlayersService` that backfills any existing users without a self-Player — idempotent via
`findFirst`+`create` (no `upsert` since `Player.userId` has no `@unique` constraint). Invite-accept
that binds a guest Player does NOT create a second Player (the linked guest IS the self-Player).
Updated `invites.service.spec.ts` cleanup to delete player rows created by the new path. Confirmed
the Prisma `User.players` relation field (named `"PlayerLinkedUser"`) is used for the
`where: { players: { none: {} } }` backfill query.

**#2 — seat reorder:** The seat-order preview was read-only (reflected checkbox order). Replaced with
an interactive ordered list with up/down arrow buttons. The `selectedPlayerIds` array is the single
source of truth for both selection and seat order — `movePlayer()` swaps adjacent entries in-place.
Drag-and-drop was rejected (no dnd library installed); up/down buttons are mobile-friendly and
accessible (min-height 44px, aria-labels). Verified in browser: two reorder buttons appeared
immediately after selecting 2 players, and clicking reorder changed the submitted `participantPlayerIds`
order.

## 2026-06-24 — SetupGate: silent "assume complete" on error caused login instead of wizard (prompt 12)

**Root cause (confirmed in browser via Playwright headless):** The original `SetupGate`
called `getSetupStatus()` in a `useEffect` with an imperative `navigate('/setup')` on success.
On error, its `.catch` silently set `setupComplete = true` ("assume complete"). On a fresh DB
the `/api/setup/status` call *succeeded* with `{"setupComplete":false}`, so the catch wasn't
the trigger in all cases — but the imperative `navigate('/setup')` fired *after* `ProtectedRoute`
had already received control, causing a race: `ProtectedRoute` (rendered synchronously before the
effect fires) saw an unauthenticated user and redirected to `/login` before the gate's
`navigate('/setup')` could run. The result was the login page, not the wizard.

**Fix:**
1. **Declarative redirect instead of imperative navigate.** When `setupComplete === false`,
   `SetupGate` now returns `<Navigate to="/setup" replace />` (React Router declarative), which
   is rendered synchronously on the *same* render pass that processes the fetched status — no
   effect timing window for `ProtectedRoute` to race in.
2. **Error shows retry UI, not silent fallthrough.** If `getSetupStatus()` rejects, the gate now
   renders an error message with a Retry button instead of silently assuming setup is complete.
   This prevents fresh installs from ever landing on the login page due to a transient network error.

**Browser evidence:** Playwright headless against the dev nginx ingress with an empty DB confirmed:
`page.goto('/')` → final URL `http://localhost:8088/setup`, wizard text visible, no login text.
Full first-run flow also verified: filled wizard → "Create account" → redirected to `/` (dashboard,
authenticated). After setup, a cleared-cookie visit to `/` → `/login` → successful login → `/`.

**Rejected alternative:** adding `async/await` in `useEffect` with a `navigate` after await — this
still leaves a frame window where `ProtectedRoute` renders before the navigation resolves.

## 2026-06-24 — Dev debug ports opt-in via Compose override (prompt 11)

- **Base + thin override pattern chosen over a single file with all ports.** The base
  `docker-compose.dev.yml` is stripped of host port bindings for db/backend/frontend so that
  a plain `up` publishes only the nginx ingress. A separate `docker-compose.dev.debug.yml`
  overlay adds those three ports back when passed as a second `-f` argument. This avoids
  conditional logic inside the base file and keeps the override minimal (only `ports:` keys
  — no duplicated env, volumes, or healthchecks). Docker Compose merges `ports:` additively,
  so the overlay simply appends the host bindings that are absent in the base.

- **Internal service-to-service routing is unaffected.** Removing host port bindings does not
  touch the Compose network. `backend` still reaches `db:5432` and `nginx` still proxies to
  `frontend:5173` and `backend:3001` by service name. HMR continues to flow through nginx
  (`VITE_HMR_CLIENT_PORT` stays set to `DEV_APP_PORT`).

- **`DEV_BACKEND_PORT=3001` default can collide on developer machines.** Verified during
  testing: port 3001 was already bound on the host by an unrelated process. The override file
  defaults are advisory; users set `DEV_BACKEND_PORT`/`DEV_DB_PORT`/`DEV_FRONTEND_PORT` to
  free ports as needed. The default stack is immune because those ports are not published at all.

## 2026-06-24 — nginx ingress in dev stack and moving off port 80 (prompt 10)

- **HMR-through-nginx via `VITE_HMR_CLIENT_PORT`.** Vite's HMR client needs to know which
  port to connect its WebSocket back to. When running behind nginx (where the browser-visible
  port differs from Vite's internal :5173), setting `server.hmr.clientPort` in `vite.config.ts`
  overrides the port the in-browser HMR client uses. This is read from the `VITE_HMR_CLIENT_PORT`
  env var injected by docker-compose.dev.yml, defaulting to `DEV_APP_PORT` (8088). Verified:
  the compiled `@vite/client` module contains `const hmrPort = 8088` when the stack is running.
  Nginx proxies all websocket upgrades on `/` through to `frontend:5173` via
  `proxy_http_version 1.1` + `Upgrade`/`Connection` headers, so HMR traffic flows normally.

- **Default ports: 8080 (prod) and 8088 (dev).** Neither stack uses port 80 — the homelab
  context means port 80 is typically taken by a reverse proxy upstream (e.g. Caddy/traefik).
  8080 and 8088 are conventional unprivileged alternatives that don't require elevated
  permissions and are easy to remember. All ports are env-overridable.

- **`backend/Dockerfile.dev` updated to install `openssl` and run `prisma migrate deploy`.** The
  Prisma 5.x query engine for Alpine linux (linux-musl) requires `libssl.so.1.1`, but Node
  24 on Alpine 3.24 ships only OpenSSL 3.x (`libssl.so.3`). Without the `openssl` package
  installed, the Prisma engine fails to load at runtime. The fix: `RUN apk add --no-cache openssl`
  in the Dockerfile and `npx prisma generate` at build time (so the engine is selected against
  the installed OpenSSL). The CMD also now runs `prisma migrate deploy` before `pnpm dev`
  so migrations are applied automatically on container start, matching the prod compose behaviour.
  (Previously, migrations had to be run on the host before starting the dev stack.)

## 2026-06-24 — Integration tests, Playwright e2e, and stable test suite (prompt 09)

- **Backend integration specs run serially (`jest maxWorkers: 1`).** The DB-backed specs all
  share one Postgres database, and `setup.service.spec.ts` depends on *global* state: `runSetup`
  rejects if any `SUPER_ADMIN` exists and reads the singleton `globalSetting` row, so its
  `cleanupSuperAdmins()` deletes *every* `SUPER_ADMIN` (and that admin's tokens) found in the DB.
  Under Jest's default multi-worker parallelism this races with other specs that create their own
  super-admins mid-transaction — e.g. `invites.service.spec.ts`'s `acceptInvite` failed with
  "Record to update not found" because the setup spec deleted its token concurrently. Pinning
  `maxWorkers: 1` (equivalent to `--runInBand`) eliminates all cross-worker contention
  deterministically; verified green across three consecutive full runs (114/114). Per-suite
  truncate or per-worker DBs were considered but rejected as heavier than warranted at this suite
  size, and they would not fix the genuine global-state coupling of the setup wizard tests.

- **`SessionService` and `CsrfService` moved from `AuthModule` to `RbacModule`.** `AuthGuard`
  and `CsrfGuard` live in `RbacModule`. Both guards need their respective services as DI
  dependencies. The original layout had `SessionService` in `AuthModule` (which imports
  `RbacModule`), creating a circular dependency. Moving both services into `RbacModule` (where
  their guards live) breaks the cycle cleanly and is semantically appropriate — session and CSRF
  are cross-cutting auth primitives, not authN-domain concerns.

- **`packages/contract` JSON schema exported via ESM `import` instead of `require()`.** The
  contract package is compiled with `"module": "NodeNext"` which outputs `require()` calls in
  CJS. When Vite bundles the frontend, it can see through the re-export but the bare `require()`
  in the browser bundle causes "require is not defined". Switching to `import moduleSchema from
  './module.schema.json'` lets Vite handle the JSON import natively (tree-shaken, browser-safe).
  The `package.json` build script was also updated to `tsc && cp src/*.json dist/` so the JSON
  file is available at `dist/module.schema.json` for Node consumers (backend, e2e global setup).

- **Backend `BigInt` serialization patched at startup.** `GameEvent.id` is a `BigInt` Postgres
  `bigserial`. NestJS serializes controller return values with `JSON.stringify`, which throws on
  `BigInt`. Rather than wrapping every controller or service return, `main.ts` patches
  `BigInt.prototype.toJSON` once at startup to return `this.toString()`. This is a single-point
  fix consistent with how similar monolithic backends handle this (e.g., Fastify's built-in
  support is equivalent). BigInt IDs serialize as strings, which is correct for JSON — JS numbers
  lose precision past 2^53.

- **Playwright e2e invite test uses a separate browser context for the invite-accept step.**
  The admin is logged in when creating the invite. After creating the link and navigating to
  `/invite/:token`, the `Login` component checks `if (user)` synchronously during render —
  because the admin session is still active, `user !== null`, and `Login` immediately calls
  `navigate('/')` and returns `null`, blanking the page. The fix: accept the invite in a fresh
  browser context (no cookies), so the session is clean and the login form renders normally.

- **`setup.service.spec.ts` cleanup extended to handle game data created by other tests.**
  The `cleanupSuperAdmins()` helper originally deleted only sessions/tokens/auditLogs before
  deleting the admin user. After e2e tests run (creating players + Skyjo games linked to the
  admin), the FK chain `Player → Participation → ScoreState / GameResult / GameEvent / Game`
  blocked deletion. The helper now cascades through that chain in FK-safe order before deleting
  players and users.

## 2026-06-24 — Play UI: playgroups, Skyjo play, autosave/resume, results, history (prompt 08)

- **409 stale-version handled via raw fetch in postEvent.** `ApiClient.post()` parses the error body but only extracts `statusCode/message/field`, losing the `currentVersion` and `scoreStates` fields in the 409 response body. Rather than extending ApiClient (shared code), `postEvent` in `api/play.ts` uses raw `fetch` directly (same credential/CSRF pattern) so it can read the full 409 body and throw a typed `StaleVersionError`. This keeps ApiClient simple and the conflict handling co-located with the game API.

- **clientEventId is generated once per round submission and reused on retry.** The UUID is generated when the user clicks "Save Round" and stored in component state. If the POST fails (network error), the component retries with the same UUID (idempotency). On 409, the game state is reloaded and a new UUID is generated for the retry (because the round entry may change after the state reload). This matches the spec: "idempotent retries reuse the same id."

- **Ended-round is an exclusive single-selection, not a checkbox per player.** Since exactly one player per round ends the round (the one who flips all their cards), the UI uses a set of toggle buttons (one per participant) where selecting one deselects all others. This prevents the common mistake of accidentally checking multiple players. A plain radio group would also work but the toggle buttons are more touch-friendly.

- **ResultsPage accepts both router state and fetched game data.** When navigated from GamePage after calling /finish, the results are passed as router `state.result` (avoids an extra GET call). When navigated directly to `/play/:id/results` (or on page reload), a GET /api/games/:id is called and totals are read from `scoreState.payload.totals` since the result rows aren't yet returned by the list endpoint.

- **Dashboard updated to surface active games + play entry points.** The placeholder "coming soon" text is replaced with a functional dashboard: "Start New Game" CTA, active games list with resume links, and navigation to History and Players/Playgroups management. This gives the app a usable home screen without creating a separate navigation layer.

- **SkyjoReference hardcodes the module info.** Loading module info via the backend at runtime adds a round-trip and requires a GET /api/modules endpoint (not yet built). The Skyjo rules/scoring reference is stable (from module.yaml) and hardcoded in the SkyjoReference component for M1. When the module API is added (post-M1), this can become a dynamic fetch.

- **Card component extended with optional `style` prop.** Play UI screens need margin spacing between stacked Card elements without creating wrapper divs for every case. The Card component was extended to accept an optional `style?: React.CSSProperties` prop, passed through to the root div. This is a minimal, non-breaking addition consistent with the existing `className` passthrough.

## 2026-06-24 — Admin UI: users, invites, resets, groups, audit (prompt 07)

- **`AdminLayout` defers permission checks until `loading=false`.** The auth context starts with
  `loading=true` while the `GET /api/auth/me` call is in-flight. `AdminLayout` previously checked
  `hasPermission()` during the loading phase, always saw zero permissions, and immediately
  redirected to `/`. Adding a loading guard (render `<Spinner>` while `loading`) prevents the
  premature redirect. The pattern is: `if (loading) return spinner; if (noPermission) redirect;`.

- **Tier-aware gating via `admin/tier.ts` mirrors `src/rbac/tier-rule.ts` exactly.** The frontend
  implements `canActOn(actorRole, targetRole)` using the same `ROLE_TIER` numeric map as the
  backend. UI actions (Change role, Disable, Generate reset link) are hidden — not just disabled —
  when the actor cannot act on the target's tier. The backend re-enforces this; the UI just
  avoids surfacing impossible actions that would result in 403s.

- **Copy-link UX: shown once in a modal on creation, not persisted.** The raw invite/reset link
  is returned by the API on creation only. The modal shows a readonly text input (click-to-select)
  plus a "Copy" button using `navigator.clipboard.writeText`. On clipboard failure (e.g. insecure
  context) a toast error prompts manual selection. The link is not retrievable after the modal is
  closed — intentional: tokens are single-use secrets.

- **Permission toggle UX cycles: no-override → deny → remove override (not grant).** For per-user
  permission overrides, the "Toggle" button cycles through three states: (a) no override (role
  default applies) → (b) explicit deny → (c) remove override (back to role default). There is no
  "explicit grant" via the button because the correct way to extend permissions is to either
  promote the role or add the user to a "Can-X" group. This keeps the per-user override surface
  narrow and understandable for admins.

- **Admin route nested under `<AdminLayout>` as a React Router v6 layout route.** The `/admin/*`
  routes are nested children of a `<Route path="/admin" element={<AdminLayout />}>`. The layout
  renders the AppBar + tab nav + `<Outlet />`. Each section (users, invites, etc.) is a child
  route. The `<Route index>` at `/admin` redirects to `/admin/users`. This pattern means prompt
  08 (play UI) can follow the same structure for its own layout if needed.

- **`apiClient.get()` always passes `{ method: 'GET' }` as fetch opts — test mocks must account
  for this.** In Vitest mocks, `opts?.method === 'GET'` is always truthy for GET calls; you
  cannot use `!opts?.method` to detect GETs. Test mocks use URL as primary discriminator and
  check `opts?.method === 'POST'/'PUT'/'DELETE'` for mutations only, placing mutation-method
  checks before URL-only checks to avoid ambiguity.

- **Groups permissions modal uses checkbox pairs (Grant / Deny) per permission.** Each permission
  in the group edit modal has two independent checkboxes: "Grant" and "Deny". Only one can be
  active at once (toggling Grant while Deny is on replaces the deny). This mirrors the backend
  `GroupPermission` model where each row is `{ permission, granted: boolean }`. An unchecked pair
  means "no override for this permission in this group."

## 2026-06-24 — Frontend foundation: design system, app shell, auth UI (prompt 06)

- **Theme mechanism: CSS custom properties + `data-theme` attribute + localStorage FOUC prevention.**
  Theme tokens live in `tokens.css` using CSS custom properties scoped to `[data-theme='light']`,
  `[data-theme='dark']`, and `@media (prefers-color-scheme: dark)` for SYSTEM. An inline `<script>`
  in `index.html` reads `localStorage.getItem('gl_theme')` and sets the `data-theme` attribute
  before React hydrates, eliminating flash of wrong theme. SYSTEM preference is implemented by
  removing the `data-theme` attribute entirely (letting the CSS media query take over) rather than
  reading the media query in JS, which keeps the FOUC prevention script tiny.

- **No heavy UI framework — hand-rolled widget library.** All components (Button, TextField, Card,
  Modal, Table, Toast, Spinner, AppBar, FormField) are written from scratch with CSS custom
  properties for all color/spacing values. No Tailwind, Radix, or MUI. Rationale: the app is
  small enough that a bespoke library is lower dependency surface and easier to theme; the BEM-style
  class names in `styles.css` are unambiguous for prompt 07/08 authors to extend.

- **`@game-ledger/contract` resolved to TypeScript source in Vite via `resolve.alias`.**
  The contract package outputs CommonJS (NodeNext module system for backend compatibility). Vite's
  rollup bundler rejects CJS enums as tree-shakeable ESM values. Solution: a `resolve.alias` in
  `vite.config.ts` maps `@game-ledger/contract` to `packages/contract/src/index.ts`, letting
  Vite handle it natively as TypeScript. TypeScript (`tsc`) already resolved through node_modules
  types (the `.d.ts` dist) so no tsconfig change was needed.

- **Auth context shape: `AuthProvider` + `useAuth` hook, no Redux/Zustand.**
  `AuthContext` holds `user | null`, `loading`, `error`, and `login/logout/hasPermission/refreshUser/setTheme`
  methods. `setTheme` is optimistic: it calls `applyTheme()` locally first, then `PATCH /api/auth/me`,
  then updates the user state. This keeps the UI snappy without a separate "pending" state for
  theme changes.

- **CSRF: singleton `ApiClient` reads `gl_csrf` cookie on every mutation.**
  Rather than caching the CSRF token at login time (which would break on CSRF rotation), the client
  reads `document.cookie` fresh on each `post`/`patch`/`put`/`delete` call. The backend rotates the
  CSRF token on every `GET /api/auth/me` (which fires on load), so the token is always fresh.

- **Router: `SetupGate` component checks setup status on every non-/setup route.**
  The gate fires `GET /api/setup/status` on mount and navigates to `/setup` if incomplete. It does
  not re-check after initial render. The `InstallWizard` component also checks on mount so a direct
  `/setup` visit after setup completes redirects to `/`. This means the setup check runs twice on
  a fresh install but is idempotent.

- **Vitest v2 pinned (not v4) for Vite 5 compatibility.**
  Vitest v4 requires Vite ^6 as a peer dep, but the frontend uses Vite 5. Pinning to `vitest@^2`
  avoids the peer dep conflict. All 28 tests run cleanly under v2.

## 2026-06-24 — Game engine, scoring types, Skyjo module, event write model (prompt 05)

- **Scoring-type registry is in-code TS with no DB coupling.** Each `ScoringType` is a pure
  function keyed by `${id}@${version}`. DB stores the `scoringTypeId`/`scoringTypeVersion`
  strings as identifiers; the math lives in `scoring-type.registry.ts`. This separates
  persistence from computation and makes the registry easily unit-tested without mocking Prisma.

- **`skyjo/doubling` resolver key pattern.** Round resolvers are registered as named hooks
  (`Record<string, RoundResolver>`) in the scoring registry. Module YAMLs reference them by
  string key (`roundResolver: "skyjo/doubling"`). This avoids coupling module YAML authoring to
  TypeScript class hierarchies while keeping the hook mechanism extensible.

- **`version` = max(seq) for the game, not a separate column.** The game's current version for
  optimistic concurrency is computed as `max(seq)` from `game_events` (or 0 if no events). This
  avoids a separate version counter on the `Game` row that could drift out of sync with the event
  log. One aggregate query per write is cheap at the event volumes expected.

- **ScoreState materialization reads all events on each write, not a delta.** Each `postEvent`
  call re-reads all events for the game and reconstructs the full `ScoreStatePayload` from
  scratch. This ensures `ScoreState == replay(events)` as a strict invariant without maintaining
  delta-application logic. At the round counts Skyjo reaches (20-30 rounds), this is fast.

- **Idempotency checks `clientEventId` before the version check.** The idempotency path (return
  current state) short-circuits before the concurrency check so that a client re-sending a
  previously applied event always succeeds, regardless of the current version. This matches the
  intent: idempotency = "re-sends are safe"; concurrency rejection = "conflicting new write".

- **Scorekeeper is the game creator (single-scorekeeper M1).** `Game.createdById` (the User who
  called `POST /api/games`) is the scorekeeper. All event writes and `finish` calls are gated on
  `createdById === actorId`. The multi-scorekeeper model (per-participant write rights) is deferred
  to post-M1 as noted in the spec.

- **`modules/` root path resolution uses `../../../modules` from `src/` or `dist/`.** Both
  source (`src/module-loader/`) and compiled (`dist/module-loader/`) contexts reach the project
  root in exactly 3 `../` hops: `module-loader` -> `src|dist` -> `backend` -> `game-ledger`.
  A 4-hop path (`../../../../`) would overshoot to the pnpm workspace root.

- **Backticks in JSDoc block comments cause TypeScript parse failures in this project's config.**
  JSDoc block comments with backtick-delimited inline code (e.g. `\`${key}@${ver}\``) triggered
  TS1443 parse errors when processed by ts-jest. Root cause: interaction between the TypeScript
  parser and the project's `moduleResolution` settings. Workaround: use double-quotes or plain
  text in block comments; move backtick strings to line comments (`//`).

## 2026-06-24 — Players, guests, and playgroups (prompt 04)

- **Nickname uniqueness is per-playgroup, not global.** Guest nicknames have no global uniqueness
  constraint in the DB. The spec left this open; we resolve it as: uniqueness is meaningful only
  within a playgroup at game-start time (when the prompt-05 game engine selects participants from
  a group). Enforcing global uniqueness would prevent two different creators from both having a
  guest called "Bob," which is wrong when they're unrelated people. Enforcement at the game
  layer keeps the roster API simple and aligns with the spec's per-playgroup scope.

- **`PATCH /api/players/:id` only renames guests (userId === null).** Registered users' display
  names are managed through their `User.nickname` field (via `PATCH /api/users/:id`). Attempting
  to rename a linked Player throws 403. This is the cleanest separation: the Player row is the
  stable identity anchor; the User row owns the human-readable name for registered users.

- **Playgroup membership add/remove leaves `Player` rows intact.** Deleting a `PlaygroupMember`
  row only removes the link — the Player row is never touched. This preserves historical
  participation references (Participation rows reference Player IDs) and matches the spec's
  "group persists across roster changes" requirement. The game engine (prompt 05) will FK-join
  `Participation → Player`; those rows must outlive membership changes.

- **`assertPlaygroupAccess` dual-mode (read vs. manage).** A single private helper handles both
  read access (owner, VIEW_ALL, or member via their Player rows) and mutation access (owner or
  MANAGE_USERS). The `requireManage` flag selects the mode. This avoids duplicating the
  ownership + elevated-permission check across five methods while keeping the two access patterns
  distinct.

- **`addMember` is idempotent (upsert).** Adding an already-present Player to a playgroup is a
  no-op (upsert with empty `update: {}`). This makes the API friendlier to retry and avoids 409
  errors on client retries.

- **Playgroup read access for members uses an indirect Player lookup.** Because members are stored
  as `PlaygroupMember { playgroupId, playerId }` and a user can have multiple Player rows (their
  own linked row + guests they created), access check fetches all Player IDs for the actor, then
  checks for membership intersection. This handles both a user viewing their own group and a
  guest's creator viewing a group that guest belongs to.

## 2026-06-24 — User management, invites, resets, groups, audit (prompt 03)

- **Token hash reuse — shared `common/token.util.ts` (`generateRawToken` + `hashToken`).** The
  same SHA-256 pattern used for session tokens (in `SessionService`) is extracted into a
  shared utility. Both `InvitesService` and `ResetsService` call these functions. No separate
  crypto infrastructure is needed per token type — the typed `Token` table (with `type`
  discriminator) handles routing.

- **Invite → guest-Player linking via `Player.userId = newUser.id` on accept.** The `Player`
  table has an optional `userId` (already in the schema). On invite-accept, the transaction
  updates `Player.userId` so the guest's participation history automatically belongs to the
  new account. No data migration or tombstoning needed. For prompt 04 (players/playgroups):
  when building the player roster, a `Player` row with `userId !== null` is a registered
  user; with `userId === null` it is a guest. Queries that join `Player` to `User` need to
  handle both cases.

- **Reset session revocation on password change.** `ResetsService.consumeResetToken` revokes
  all existing sessions (via `Session.revokedAt`) in the same transaction as the password hash
  update. This ensures a compromised account's attacker is immediately logged out when the
  owner resets their password. The mechanism mirrors `AuthService.logoutAll`.

- **`includeDisabled` default-hides DISABLED accounts.** `UsersService.listUsers` uses
  `NOT: { state: DISABLED }` in the Prisma `where` filter when `includeDisabled=false`.
  This keeps the admin user list clean by default without adding an explicit status column
  filter that might clash with `PENDING` rows. A `PENDING` user (invited but not accepted)
  does appear in the default list since they are not yet `ACTIVE` but not DISABLED either.

- **`disableUser` protects the sole SUPER_ADMIN.** The service checks `COUNT(SUPER_ADMIN,
  NOT DISABLED)` and throws 403 if the result is ≤ 1. This prevents a lone super-admin
  from locking themselves out. The same guard is not applied to `ADMIN` or lower tiers since
  there is always at least one SUPER_ADMIN with recovery rights.

- **`accept/:token` endpoints are unauthenticated — CsrfGuard is intentionally skipped.**
  Invite-accept and reset-consume are public endpoints (the user has no session yet). They
  cannot use the double-submit CSRF pattern. The token itself (128-bit random, single-use,
  SHA-256 stored) serves as the CSRF-equivalent proof of intent.

- **`UserResetLinkController` as a sub-controller under `/users/:id/reset-link`.** The reset
  endpoint lives on the user sub-path per the spec (`POST /api/users/:id/reset-link`) but
  the reset service is in its own module. A lightweight controller exported from `ResetsModule`
  and registered in `AppModule` handles this routing without duplicating service logic.

- **`APP_BASE_URL` env var seeds invite/reset links.** Links returned by the API are
  `${APP_BASE_URL}/invite/accept/:token` and `${APP_BASE_URL}/reset/:token`. This decouples
  the backend from the frontend URL (useful in dev where they run on different ports). Defaults
  to `http://localhost:5173`. No email/SMTP: the link is returned in the API response for
  out-of-band sharing.

## 2026-06-25 — Auth core, sessions, RBAC (prompt 02)

- **Session token: raw in cookie, SHA-256 hash in DB (`tokenHash`).** The httpOnly session
  cookie carries the 32-byte random hex token. Only `SHA-256(token)` is stored in the DB
  (`sessions.token_hash`). A DB compromise exposes no usable tokens; revocation still works
  via the hash lookup. Added via a manual migration (advisory-lock issue with `prisma migrate
  dev` in non-interactive CI-like envs; resolved by using `prisma migrate deploy` with a
  hand-authored SQL file).

- **Session lifetime: 7 days.** Mobile-first app, "stay logged in" is expected behaviour.
  7 days balances convenience vs. risk. Configurable via `SESSION_TTL_MS` env var. There is
  no separate "remember me" toggle — the same TTL applies; a shorter session (e.g. 1 h) would
  make the mobile UX painful.

- **CSRF approach: double-submit cookie pattern.** Login and `/me` issue a `gl_csrf` (non-httpOnly)
  cookie containing `random.HMAC(sessionId:random, SESSION_SECRET)`. State-changing requests
  must include the same value in the `X-CSRF-Token` header. The `CsrfGuard` can be applied
  selectively to mutation endpoints. `SameSite=Lax` on the session cookie already blocks the
  most common CSRF vector; the double-submit adds defence-in-depth. Full SameSite=Strict was
  rejected as it breaks any top-level navigation login flow.

- **Brute-force lockout: 5 failures → 15-minute lockout, per-account.** Stored as
  `failed_login_attempts` + `locked_until` on the `User` row (two columns added via migration).
  Counts reset on successful login. IP-level throttle is handled by the `@nestjs/throttler`
  global rate limit (100 req/60 s default; 10/60 s on the `auth` throttle profile). A Redis-
  backed distributed counter was not needed for a homelab-scale deployment.

- **Constant-time dummy hash to prevent user-enumeration on login.** If no user is found for
  the given email, the service still calls `argon2.verify(dummyHash, password)` before
  throwing 401. This makes the response time indistinguishable from a wrong-password failure
  on an existing account.

- **argon2id with OWASP-recommended parameters (m=65536, t=3, p=1).** Not bcrypt. argon2id
  is the current NIST/OWASP recommendation for password hashing; bcrypt has a 72-byte input
  limit and is weaker against GPU attacks. The options are hardcoded in `PasswordService`;
  upgrading means a migration to re-hash on next login (standard practice).

- **Password policy hook comment in `PasswordService.validatePolicy`.** The current rules
  (≥10 chars, upper + lower + digit) are enforced. A zxcvbn strength check was deemed
  out-of-scope for M1 but the method is the single call-site; add it here.

- **Permission resolution is pure/sync for unit testing.** `PermissionService` exposes both
  `resolveEffectivePermissions(userId, role)` (async, DB) for production use and
  `resolveEffectivePermissionsSync(role, groupOverrides, userOverrides)` (pure function) so
  tests can verify resolution logic without mocking Prisma.

- **Tier rule as a pure function, not a service.** `canActOn(actorRole, targetRole)` in
  `src/rbac/tier-rule.ts` is a standalone exported function with no DI dependencies. Prompt 03
  (user management) imports it directly to gate user-management actions.

## 2026-06-25 — M1 DB schema (prompt 01)

- **Permission enum in DB (Prisma native enum) + mirrored in contract:** Rather than storing
  permissions as strings, both the DB and the contract package use consistent enum values
  (`CREATE_GAME`, `INVITE_USERS`, etc.). This prevents drift between the two sides. The DB
  enum is authoritative; the contract enum value strings are kept identical.

- **`ROLE_DEFAULT_PERMISSIONS` map in contract (not DB):** Role → permission defaults live in
  code (contract package), not a DB table. A `UserPermissionOverride` row (or `GroupPermission`
  row) only needs to exist when the user/group deviates from the role default. This keeps the
  permission-check path simple: start from the role default set, apply group overrides, apply
  per-user overrides.

- **Single typed-token table (`Token`) with `type` discriminator:** Invites, password resets,
  and share links share one table with nullable target columns (`targetUserId`, `targetGuestPlayerId`,
  `targetGameId`, `targetEmail`). The `type` column and `status` enum handle all lifecycle
  states. Alternative (separate tables per token type) was rejected — it duplicates the hash
  uniqueness and expiry logic for no benefit at this scale.

- **`GameEvent` PK choice — surrogate `BigInt @id` + unique (gameId, seq):** The docs showed
  two options: composite `(game_id, seq)` PK or a surrogate. We use a surrogate `BIGSERIAL`
  as `@id` and add `@@unique([gameId, seq])` + `@@index([gameId, seq])`. Prisma's ORM relations
  require a single-column `@id`; the composite unique constraint still enforces the monotonic
  ordering invariant and serves ordered replay queries equally well.

- **`ScoreState` PK — composite (gameId, participationId) with unique on participationId:**
  `participationId` uniqueness ensures at most one state row per participation slot. The
  composite PK makes the join from `Game` side efficient. `updatedAt` is auto-managed by Prisma
  (`@updatedAt`) to track when state was last materialized.

- **`GameResult.score` typed as `Decimal(12,4)` not `Float`:** Avoids floating-point precision
  loss for numeric totals and chip-poker net deltas. `rank` is nullable (not all result types
  have a meaningful numeric rank). `normalized` is `jsonb` for the full scored breakdown,
  enabling future stats queries without schema changes.

- **`GlobalSetting` singleton row (id=1):** A single row guards the install-wizard gate
  (`setupCompletedAt`). Upsert on `id=1` is the canonical access pattern. A boolean
  `setupCompleted` was considered but `setupCompletedAt` is richer (audit trail of *when*).

- **`GameModule` has a surrogate cuid `id` + unique `(moduleKey, version)`:** The stable
  human identifier is `moduleKey` (e.g. `"skyjo"`); `version` is semver. Games pin to
  `(moduleKey, moduleVersion)` on the `Game` row — not a FK to `GameModule.id` — so a game
  record is self-contained even if the module row is replaced or the module isn't loaded
  into DB yet. This matches the docs' intent that modules can also be pure YAML files.

- **`Playgroup.createdById` is a String (not FK to `User`):** Consistent with `Player` and
  `Game` — the creator is always a `User` and FK-constrained. `Playgroup` doesn't grow a
  FK to `User` because Prisma requires the relation to appear on both sides; the `User` model
  would need a `playgroups` relation field, which is fine but adds noise. We kept it as a
  FK (`createdById` → `users.id`) so referential integrity is enforced. (Note: the `User` model
  does not expose a `playgroups` backrelation field to keep the model lean — that query goes
  through `Game.playgroupId` → `Playgroup` instead.)

## 2026-06-24 — Scaffold (prompt 00)

- **Jest moduleNameMapper for `@game-ledger/contract`:** The backend jest config maps
  `@game-ledger/contract` to the TypeScript source (`packages/contract/src/index.ts`) so tests
  don't require a pre-built contract dist. The tsconfig.build.json used for `nest build` strips
  the paths alias (`paths: {}`) so it resolves through the workspace dep in `node_modules`,
  which requires the contract to be built first.
- **`shamefully-hoist=true` in `.npmrc`:** pnpm's default isolated linker creates virtual store
  symlinks that embed host-machine absolute paths in generated bin wrapper scripts. This breaks
  Docker builds where the paths differ. `shamefully-hoist=true` flattens `node_modules` and
  generates relative-path wrappers, which work correctly in containers.
- **pnpm pinned to 9.15.9 in Dockerfiles:** `pnpm@latest` in Docker resolves to 11.x which has
  stricter build-script approval semantics (`ERR_PNPM_IGNORED_BUILDS`). Pinning to the host
  version (9.15.9) plus `enable-pre-post-scripts=true` in `.npmrc` avoids the issue.
- **Frontend dev container CMD:** pnpm runs scripts relative to the workspace package dir.
  With `shamefully-hoist`, vite resolves to root `node_modules/vite/bin/vite.js`, not the
  package-local path the pnpm script wrapper expects. The Dockerfile.dev CMD is therefore
  `node /app/node_modules/vite/bin/vite.js --host` to bypass the broken wrapper entirely.
- **`tsconfig.build.json` `paths: {}`:** Overrides the `paths` alias from `tsconfig.json` so
  `nest build` resolves `@game-ledger/contract` via node_modules (the published dist) rather
  than the TypeScript source path, which would violate `rootDir` constraints.
- **Prisma placeholder model (`SchemaVersion`):** A real model is needed for `prisma migrate`
  to generate SQL. Using a trivial model proves the migration flow without polluting the
  intended schema; it will be replaced in prompt 01 (DB schema).

## 2026-06-24 — Foundational (project setup)

- **Stack:** TypeScript end-to-end — NestJS + Prisma (backend), React + Vite + TS (frontend),
  pnpm monorepo, shared `packages/contract`. Postgres. Prebuilt nginx ingress. *Why:* frontend-
  heavy app with a contract shared by both sides; NestJS guards/DI fit the RBAC-heavy auth phase.
- **Module format:** YAML, validated by a JSON Schema on load. *Why:* author-friendly (comments,
  no brace noise), strict via schema; YAML is a JSON superset so no expressiveness lost.
- **M1 scope:** the full user/auth/admin system + Skyjo as the first game module (see
  `decisions-needed.md`).
- **Process:** dev-only with local builds now; PR + Gitea Actions CI deferred to pre-launch.
  Build via handoff prompts dispatched to Sonnet; **each prompt = one commit on `dev`**;
  **no Claude/AI mention in commit messages**.
- **Testing:** unit tests inside each coding prompt's definition-of-done; a dedicated
  integration + Playwright e2e prompt once the vertical slice runs.
