# Decisions needed before / during development

> Synthesized from all design docs (`spec.md`, `module-contract.md`, `data-model.md`,
> `user-management.md`, `games/catalog.md`) plus gaps not yet written down. Ordered by **when
> you must decide**, not importance. Each carries a recommendation. This is the agenda to clear
> before (and just after) the first line of code.

## M1 built (2026-06-24)

All M1 deliverables are complete and the test suite is green:

- **Backend unit + integration tests**: 114 tests pass (`pnpm test` in `backend/`)
- **Frontend unit tests**: 46 tests pass (`pnpm test` in `frontend/`)
- **Playwright e2e**: Skyjo happy path + invite flow both pass (`pnpm test:e2e`)
- **Full lint + build**: `pnpm lint` and `pnpm build` pass clean

What was built vs. the M1 scope in the Resolved section below: everything listed there was
delivered. The "still deferred" items (offline/PWA, multiple modules, etc.) remain deferred.

---

## Resolved (2026-06-24)

- **Stack — TypeScript end-to-end.** Backend **NestJS + Prisma**; frontend **React + Vite +
  TypeScript**; **pnpm** workspaces; shared **`packages/contract`** (TS types + JSON Schemas).
  Prebuilt **nginx** ingress; **Postgres** db. (NestJS chosen for built-in guards/DI/validation —
  a good fit for the RBAC-heavy auth phase.)
- **Database — Postgres.**
- **Repo — monorepo** (`/backend`, `/frontend`, `/packages/contract`, `/modules`).
- **Module format — YAML, validated against a JSON Schema** on load.
- **Phase 1 (M1) scope — the FULL user/auth/admin system + Skyjo as the first game module.**
  Includes: install wizard → Super Admin; email/password login + sessions; the role tiers
  (Super Admin/Admin/Manager/Player/Guest) + permissions/groups; **invites (copy-link)**,
  **admin/permitted password-reset links**, admin user-management (users + invites + resets
  views, disable=delete, show-disabled toggle); playgroups + players/guests; and a playable
  **Skyjo** game (numeric_rounds + the cross-player doubling resolver), single scorekeeper,
  server autosave. **Still deferred from M1:** offline/PWA, custom visualizations beyond
  Skyjo's needs, multiple modules, leaderboard sharing, email/SMTP resets.
- **Deployment — two compose files:** `docker-compose.yml` (prod-ish) + `docker-compose.dev.yml`
  (dev: hot-reload, exposed db).
- **Process:** work happens on `dev`; `main` is PR-gated with required GitHub Actions CI
  checks. **handoff-prompt-workflow** adopted (build via prompts in `prompts/` dispatched to
  **Sonnet** agents). **Commit conventions:** Conventional Commits; **no Claude/AI mention in
  commit messages**. The full `code-checkin-and-pr` standard is now fully adopted (previously
  deferred; adopted 2026-06-28 — see `docs/decisions.md`).
- **Testing:** each coding prompt includes **unit tests for the logic it adds** (auth, RBAC,
  tokens, the Skyjo scoring resolver, event idempotency) in its definition-of-done; a dedicated
  **integration + Playwright e2e** prompt runs once the vertical slice is up.

## P0 — Blockers (decide before the first line of code)

1. **Tech stack.** *(spec.md "Stack — TODO")*
   - Backend language/framework + frontend framework. The topology already fixed **SPA + API
     behind nginx**, so it's "which SPA + which API."
   - **Options:** (a) **TypeScript end-to-end** — Node API (Fastify/NestJS) + React(Vite) SPA;
     (b) **Python FastAPI** + React(Vite) SPA (matches AmmoLedger CI).
   - **Recommendation: TypeScript end-to-end.** This app is frontend-heavy (PWA, IndexedDB
     offline, custom components, design system) and has a **module contract that both sides
     share** — one language lets the client and server share those types, with the best
     PWA/offline tooling (Workbox, Dexie). FastAPI is the "what we already run" fallback.

2. **Database.** *(spec.md, data-model.md)* — **Recommend Postgres** (data-model assumes it;
   JSONB for event payloads; scales as designed). SQLite only if you want single-file simplicity
   and accept reworking the JSONB/partition assumptions.

3. **Repo structure.** *(not in docs)* — separate frontend/backend containers, but one repo or
   two? **Recommend a monorepo** (`/frontend`, `/backend`, `/modules`, `/packages/contract` for
   shared types) — simpler CI, atomic cross-cutting commits, and shared contract types live in
   one place. Matters for CI and the standards adoption.

4. **MVP scope — the first vertical slice.** *(not in docs — the most important framing call)*
   Define milestone 1 so we build a thin end-to-end skeleton, not everything at once.
   **Recommended M1 (walking skeleton):** install wizard → Super Admin → email/password login →
   create a playgroup, add players/guests → start a game using **one scoring type**
   (`numeric_rounds`) → enter scores (single scorekeeper, **server autosave, no offline yet**) →
   finish → see results + basic history. **Explicitly out of M1:** offline/PWA, invites,
   custom visualizations, multiple modules, leaderboard sharing. Proves the whole stack (event
   writes → materialized results, the type/module system, auth) with minimal surface.

## P1 — Foundational architecture (decide as the skeleton goes in)

5. **Module distribution / packaging.** *(spec.md, module-contract.md, data-model.md — appears 3×)*
   How **modules** (data), **scoring types** (code), and **custom components/visualizations**
   (code) are defined, stored, registered, discovered. **Recommend:** scoring types + components
   = code registries compiled in; module definitions = **seeded files in `/modules`** loaded at
   startup into a DB table for querying. Revisit "drop-in/installable modules" later.

6. **Module definition serialization.** *(module-contract.md)* — JSON vs YAML for module files.
   **Recommend YAML** for authoring (comments, readability); validated against a JSON Schema.

7. **`roundFormula` expression language.** *(module-contract.md)* — a small sandboxed
   expression lib vs. always a code hook. **Recommend a tiny sandboxed expr lib** for formulas,
   code hook (`roundResolver`) only for cross-player/complex cases.

8. **Payload validation.** *(module-contract.md)* — **Recommend JSON-Schema-validate**
   `score_entries`/event payloads against the scoring type's declared field schema.

9. **API style + the write endpoint.** *(not in docs)* — REST vs RPC, and the concrete
   **event-append endpoint** contract (idempotency via `client_event_id`, `base_version`
   concurrency). **Recommend REST + JSON**, with one append-event endpoint as the core write
   path. Worth a short `docs/api.md` once the stack is picked.

## P2 — Auth concretes (needed for the auth slice in M1)

10. **Session mechanism + token primitive.** *(user-management.md)* — confirm **server-side
    sessions, httpOnly/Secure/SameSite cookies**, CSRF, and **one typed-token table** for
    invites/resets/share-links. (Largely decided; just confirm the libraries with the stack.)
11. **Exact password rule + session lifetime.** *(user-management.md)* — pick the concrete rule
    (recommend ≥10, upper+lower+digit, + a zxcvbn strength check) and a session/remember-me
    duration.
12. **Permission model depth.** *(user-management.md)* — **Recommend role-default + a few
    per-user toggles** (shallow), groups as bulk-apply convenience. Confirm: can Admins manage
    Managers; allow >1 Super Admin (keep ≥1).

## P3 — Data-model details (decide while writing the schema/migrations)

13. **`results`: own table vs. denormalized** onto `participations`. *(data-model.md)* —
    **Recommend its own `results` table** (clean stats surface).
14. **Snapshot cadence** for `game_state`. *(data-model.md)* — **Recommend replay-from-scratch**
    for now (cheap at these sizes); add periodic snapshots only if needed.
15. **Guest identity scope + invite/merge.** *(spec.md open modeling questions)* — **Recommend
    guests owned by their creator's roster; merge only via invite/accept** re-linking
    participation rows. The trickiest data flow — design before invites ship (post-M1).
16. **Nickname uniqueness** — global vs. per-playgroup. *(user-management.md / spec.md)*
17. **Game ↔ playgroup binding** — always one playgroup, or ad-hoc/no group allowed?
    Playgroup ownership + who manages membership. *(spec.md)*

## P4 — Ops / process (now being implemented on GitHub)

18. **Standards adopted.** ✅ `CLAUDE.md` + `standards.md` in place; `dev` is the working
    branch; `code-checkin-and-pr` fully adopted (2026-06-28); `handoff-prompt-workflow` adopted.
19. **GitHub Actions runner** — ✅ public repo on GitHub; Actions runs on GitHub-hosted runners.
    No self-hosted runner needed.
20. **CI pipeline** — 🚧 being implemented (next prompt). Required checks: lint, config
    validation, migration check, compose validation, image build, **test suite**, **SAST via
    CodeQL** (public GitHub — replaces the earlier Semgrep/Trivy plan). `main` is PR-gated on
    these checks.
21. **Image publishing** — 🚧 being implemented (next prompt). Publish matrix (`:dev`, `:sha`,
    `:latest`) to **GitHub Container Registry** (ghcr.io) + retention policy.
22. **Local dev environment** — ✅ done. `docker-compose.dev.yml` (nginx + frontend + backend +
    db, hot-reload, exposed db port). `.env`/secrets via Compose env files.

## Explicitly deferred (NOT v1 — don't spend decisions here yet)

- Offline-first beyond "resilient mid-game"; email/SMTP (Phase 2 resets); native app; SSO/OIDC;
  2FA; multi-editor live scoring; team scoring (Spades/Canasta); co-op result mode (Codenames);
  `game_events` partitioning/archival; leaderboard public-link expiry specifics.

- **In-app "Give feedback" feature — PAUSED, revisit later (NOT in v0.1.0).** A "Give feedback"
  button that captures a page screenshot + the user's note. **Status (2026-06-29):** the **backend was
  built** (commit `b60acd2`: `Feedback` model + migration, settings singleton, a native-`fetch`
  GitHub-issue service, and the `/api/feedback` + admin endpoints) but is **dormant** — there is **no
  frontend**, and GitHub forwarding is optional/unconfigured, so nothing exercises it. The full design
  is in `docs/decisions.md` (2026-06-28 plan entry). **Paused at the user's call** because the scope is
  heavier than the value for a first release. **Revisit considerations when picked back up:**
  - **De-risk the scope.** Strongly consider shipping **in-app inbox only** first (button + screenshot
    + admin Feedback inbox), with GitHub-issue forwarding as a later opt-in toggle — the backend
    already supports this split.
  - **Public-exposure problem.** This repo is **public**, so feedback text + screenshots filed as
    issues would be world-readable. If GitHub forwarding is enabled, point it at a **private** repo, or
    keep feedback in-app only.
  - **Unverified machinery.** The screenshot-into-issue path (upload PNG to a `feedback-assets` branch,
    embed the `raw.githubusercontent.com` URL) is **not yet verified to render** in a real issue and
    accumulates images with no cleanup. `html2canvas` capture is lossy (no frosted nav / cross-origin
    images / imperfect SVG board). Verify the render and decide on cleanup before relying on it.
  - **Decide on the built backend** before cutting v0.1.0: leave it dormant in the release, or revert
    `b60acd2` to keep the release clean (the design is preserved here + in `docs/decisions.md`).

## The short answer: what actually blocks starting

**P0 #1–4 (stack, DB, repo structure, MVP scope)** are the only true blockers — pick those and
we can scaffold M1. P1/P2 get decided as the skeleton lands; P4 is the parallel "stand up the
dev workflow + CI" track. Everything else can wait for the feature that needs it.
