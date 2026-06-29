---
name: 09-integration-e2e
status: done
created: 2026-06-24
model: sonnet
completed: 2026-06-24
result: >
  Full test suite green: 114 backend + 46 frontend unit tests pass; 2 Playwright e2e tests
  (Skyjo happy path + invite flow) pass. Fixed FK-safe cleanup order in setup.service.spec.ts,
  resolved NestJS DI circular dependency (SessionService/CsrfService → RbacModule), fixed
  contract JSON import (require → ESM import), fixed SetupStatusResponse field name mismatch
  (completed → setupComplete), added BigInt.toJSON patch in main.ts, fixed vite preview proxy,
  and used a fresh browser context for the invite e2e test to avoid admin session interference.
  README.md written; docs/decisions.md and docs/decisions-needed.md updated.
---

# Task: Integration + Playwright e2e, and fix test isolation (M1 hardening)

Close out M1: make the **full test suite reliably green**, fix the known backend
test-isolation gap, and add **Playwright e2e** that drives the real M1 happy path against the
running stack. Then document how to run everything.

## Before you start

- Read `CLAUDE.md`, `docs/decisions-needed.md` (M1 scope), and the prompt-08 report's happy-path
  + selectors (below).
- The whole M1 app is built (prompts 00–08, latest `f24fa60`): NestJS+Prisma backend, React+Vite
  frontend, Skyjo module, `docker-compose.dev.yml` dev stack. Docker is available.

## Working tree check

`git status --porcelain` should show only `prompts/09-integration-e2e.md`. Otherwise list and ask.

## What to do

**1. Fix backend test isolation.** Several backend integration specs are flaky **only under
parallel runs** due to an FK-cleanup gap (tests passing in isolation but interfering when run
together). Make `pnpm test` (backend) **deterministically green**: e.g. a proper truncate-cascade
reset between suites, per-worker isolation, transaction-rollback per test, or `--runInBand` —
pick the cleanest robust fix and apply it. Ensure a live Postgres is available to the suite
(document the `DATABASE_URL` / test-DB setup; the dev `db` service or a dedicated test DB).

**2. Whole-suite green.** `pnpm lint`, `pnpm build`, and `pnpm test` (backend **and** frontend)
all pass from a clean checkout with the documented DB up. Fix any real breakage you find
(don't paper over failures).

**3. Playwright e2e.** Add Playwright (config + `pnpm test:e2e` script), running against the dev
stack (use a `webServer`/compose bring-up + a fresh DB; a global setup can run the install wizard
or seed a SUPER_ADMIN). Cover at minimum:
- **Skyjo happy path:** install/login → create 2 guest players → start a Skyjo game with both →
  enter scores across ≥2 rounds (totals update, round advances) → finish → **results shows the
  low-score player as winner / rank 1** → history shows the completed game.
- **Invite flow:** an admin creates an invite link → open it → complete signup → log in as the
  new user.
- (Nice-to-have) a round where the **end-rounder doubling** applies, asserting the doubled total.

Use the prompt-08 selectors: Start Game → `/play/new`; participant `input[type=checkbox]` +
`button "Start game"`; `.score-sheet__score-input`, `.ended-round-toggle`, `button "Save Round"`,
`button "Finish Game"`; `.totals-table__row--leader`; `.results-table__win-badge`;
`.filter-tabs__tab`, `.history-card`, `.status-badge--complete`; SkyjoReference
`button[aria-expanded]`.

**4. Document running it.** Update `README.md` (create if absent) with: dev stack bring-up
(`docker-compose.dev.yml`), `pnpm dev`, running unit tests (+ the DB requirement), and
`pnpm test:e2e`. Mark M1 as built in `docs/decisions-needed.md` (a short "M1 status: complete"
note).

## Conventions to honor

- Don't change product behavior to make tests pass — fix tests/setup or real bugs. Keep e2e
  hermetic (fresh DB per run; don't depend on prior state). Reuse existing scripts/structure.
- This is the only prompt allowed to touch many areas (it's integration) — but keep changes
  scoped to test infra, e2e, and genuine bug fixes surfaced by the e2e.

## Tests (definition of done)

- `pnpm test` (backend + frontend) is **green and stable across repeated runs** (no parallel
  flakiness).
- `pnpm test:e2e` passes the Skyjo happy path + invite flow against the stack.
- `pnpm lint` + `pnpm build` green.
- README documents how to run dev, unit tests, and e2e.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-24`/`result`).
2. `git mv prompts/09-integration-e2e.md prompts/done/`.
3. Log non-obvious choices (isolation strategy, e2e harness/DB approach, any real bugs fixed) in
   `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit (`test: integration + Playwright e2e and stable test suite`
   or `feat:`/`fix:` as appropriate), clean message, **no AI mention**. Stage specific paths,
   don't push. Complete the commit before finishing — do not stall at the commit step.
5. **Report back**: commit hash + message, the isolation fix, the e2e coverage + how to run it,
   the final full-suite test counts, and any real bugs found/fixed. State clearly that M1 is
   complete (or list anything outstanding).
