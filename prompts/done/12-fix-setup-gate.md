---
name: 12-fix-setup-gate
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: >
  Root cause confirmed in Playwright headless browser: imperative navigate('/setup') inside
  useEffect raced with ProtectedRoute's synchronous redirect to /login. Fixed by returning
  <Navigate to="/setup" replace /> declaratively when setupComplete===false; error handling
  now shows retry UI instead of silently assuming complete. Full first-run flow verified in
  browser (fresh DB → wizard → create admin → dashboard; after setup, login works normally).
  All 50 unit tests pass, lint and build clean.
---

# Task: Fix first-run routing — browser shows login instead of the install wizard

On a fresh DB, loading the app at `/` through the dev nginx ingress shows the **login** page
instead of the **install wizard**, even though setup is genuinely not complete. Reproduce the
real cause in a browser, fix it robustly, and verify the full first-run flow.

## Known facts (already diagnosed)

- `GET /api/setup/status` through the ingress returns `{"setupComplete":false}` (verified via
  curl) — so setup is genuinely NOT complete; the wizard *should* show.
- `frontend/src/routes/index.tsx` → `SetupGate`: on `getSetupStatus()` **success** with
  `!setupComplete` it `navigate('/setup')`; on **error** its `.catch` sets `setupComplete = true`
  ("assume complete") → renders the app → `ProtectedRoute` redirects an unauthenticated user to
  `/login`. The observed login page means the catch (or a routing race) is firing.
- Cookies are correctly non-Secure in dev (`secure: NODE_ENV==='production'`), so that's not it.
- `/setup` (InstallWizard) is a public route outside the gate and does render the wizard
  directly — so the bug is specifically the gate's auto-routing at `/`.

## Before you start

- Read `CLAUDE.md`. Bring up the dev stack (`docker compose -f docker-compose.dev.yml up --build -d`;
  use free ports if needed). Docker + the existing Playwright setup are available.

## Working tree check

`git status --porcelain` should show only `prompts/12-fix-setup-gate.md`. Otherwise list and ask.

## What to do

1. **Reproduce in a real browser.** With a **fresh DB** (truncate/reset so `setupComplete=false`),
   use Playwright (headless) to load `/` through the nginx ingress and capture: the actual
   network result of `GET /api/setup/status` (status, body, or failure reason) and any **console
   errors**. Determine the true root cause — is the fetch failing (and why: e.g. an exception in
   the request path, an unhandled response, a routing race between `SetupGate` and
   `ProtectedRoute`), or is `navigate('/setup')` being overridden?
2. **Fix it robustly.** At minimum:
   - The first-run gate must **not silently assume "complete" on error** — if the status can't
     be determined, surface it / retry, don't fall through to login.
   - When `setupComplete === false`, reliably land on the install wizard (prefer **rendering**
     the wizard or a `<Navigate>` over an imperative `navigate()` in an effect, to avoid
     races with `ProtectedRoute`).
   - Fix whatever actually made the in-browser call/route fail (it may also affect other flows).
3. **Verify the full first-run flow in a browser** against the dev ingress: fresh DB → load `/`
   → **install wizard shows** → create the first Super Admin → ends up authenticated (dashboard),
   and a normal login works thereafter. Add/extend a Playwright e2e that covers
   "fresh DB → `/` renders the wizard, not login."

## Conventions to honor

- Keep the fix minimal and targeted; don't refactor routing wholesale. Frontend (and only the
  backend if the root cause is there). Reuse existing patterns. `pnpm lint/build/test` must pass.

## Tests (definition of done)

- A browser repro confirms the **wizard renders at `/` on a fresh DB** (the new/updated e2e
  passes), and the create-admin → authenticated flow works end-to-end through the ingress.
- Existing unit/integration/e2e suites stay green; `pnpm lint`/`pnpm build` clean.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/12-fix-setup-gate.md prompts/done/`.
3. Log the root cause + fix in `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit (`fix: ...` describing the real cause), clean message,
   **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, the **actual root cause** (with the browser evidence),
   the fix, and confirmation the first-run flow works through the ingress in a browser.
