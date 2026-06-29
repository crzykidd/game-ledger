---
name: 23-convert-players-admin
status: done
created: 2026-06-25
model: sonnet
completed: 2026-06-25
result: >
  Converted PlayersPage, AdminLayout, AdminUsers, AdminUserDetail, AdminInvites,
  AdminResets, AdminGroups, AdminAudit, and CopyLink to the new Tailwind + shadcn-style
  foundation. All 63 unit tests pass, lint clean, build passes. Design-system imports
  reduced to Toast only (across all converted screens). Screenshots captured.
---

# Task: Convert the players/playgroups + admin screens to the new UI foundation

Step 4 — the last batch of screen conversions. Convert **PlayersPage** (roster + playgroups) and
the **admin** area (AdminLayout, Users, UserDetail, Invites, Resets, Groups, Audit, CopyLink)
onto the shared Tailwind + shadcn/ui + Framer Motion foundation. After this, only the cleanup
step (retiring the old design system) remains.

## Before you start

- Read `CLAUDE.md`. App at commit `1c562f3`. Shared foundation: `frontend/src/components/ui/`
  (Button, Card, Badge, Avatar, Skeleton, SegmentedControl, Dialog, `cn()`) + `AppShell`.
  Tailwind app-wide, preflight OFF. The dashboard, auth, and play screens are all converted —
  use them as the reference look.
- Coverage to preserve: `admin.test.tsx` (users list, show-disabled, invites copy-link, resets,
  groups, tier-aware gating) and the `invite-flow` e2e. Read them first.
- `CopyLink.tsx` has an HTTP-safe clipboard fallback — keep that behavior when restyling it.
- Don't touch the user's live data; test on localhost / your own isolated stack.

## Working tree check

`git status --porcelain` should show only `prompts/23-convert-players-admin.md`. Otherwise list/ask.

## What to do

Convert, preserving ALL behavior + permission gating:
- **PlayersPage** — roster (add/rename guests), playgroups (create/rename/membership), empty
  states, on the new foundation.
- **Admin area** — `AdminLayout` (tabs, permission-gated), `AdminUsers` (search + show-disabled
  toggle, table), `AdminUserDetail` (role/disable/permissions/groups, tier-aware), `AdminInvites`
  (create → copyable link, list + status, revoke/regenerate), `AdminResets` (generate link,
  list), `AdminGroups`, `AdminAudit`, `CopyLink`.
- Use `components/ui` primitives (Button, Card, Badge, Dialog, Avatar, Skeleton) + Tailwind;
  drop these screens' reliance on the hand-rolled `design-system` CSS. Light + dark, responsive.

## Conventions to honor

- Behavior + permission gating identical; **keep tests green.** If markup changes break a
  selector the admin unit tests or invite-flow e2e rely on, update the test or add a stable
  `data-testid` — never weaken/delete assertions. Keep the CopyLink HTTP fallback.
- The shared **Toast** is still imported from `design-system/components/Toast` by several
  screens — leave it functioning (it's fine to keep using it for now; the old design system gets
  retired in the next step).

## Verify (definition of done)

- `pnpm lint` / `pnpm build` pass; `pnpm test` (frontend) green; **all e2e green** (full suite,
  isolated Postgres on a non-standard port via temp `docker run`, set `E2E_DATABASE_URL`; NEVER
  `down -v` the `game-ledger` project; clean up the container).
- Capture screenshots of PlayersPage + Admin Users + Admin Invites (desktop + mobile, light +
  dark) into a scratch dir; confirm cohesion + good dark mode.

## When done

1. Update frontmatter (`status`/`completed: 2026-06-25`/`result`).
2. `git mv prompts/23-convert-players-admin.md prompts/done/`.
3. Log notable choices in `docs/decisions.md`.
4. **Commit on `dev`** — ONE commit (`feat: convert players and admin screens to the new UI foundation`),
   clean message, **no AI mention**. Stage specific paths, don't push. Commit before finishing.
5. **Report back**: commit hash + message, screens converted, the full e2e result, screenshot
   paths, and note which screens (if any) still import the old design system (for the cleanup step).
