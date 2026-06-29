---
name: 32-maintenance-admin-page
status: done
created: 2026-06-26
model: sonnet
completed: 2026-06-26
result: >
  AdminMaintenance.tsx built with five sections (Backups list + create/download/restore/delete,
  Restore-from-upload, Export, Schedule & retention settings form, Run maintenance). Tab added
  to AdminLayout, route registered in routes/index.tsx, maintenance API functions added to
  api/admin.ts. Contract package rebuilt to include maintenance types. Tests added to
  admin.test.tsx: Maintenance tab visibility (visible/hidden), backup list renders + POST, settings
  form loads + PUTs on save, SUPER_ADMIN-only controls hidden for non-super admin. 74/74 tests
  pass, tsc --noEmit clean.
---

# Task: Admin "Server Maintenance" page (frontend)

Final slice of issue #5: a new admin page that surfaces the maintenance backend (backup/restore,
JSON export, schedule + retention settings, reindex/vacuum). Builds on prompts 28–31 — the backend
endpoints must exist. **Before writing the API layer, read the prompt-28/29/30/31 entries in
`prompts/done/` (their "report back" notes + `docs/decisions.md`) to get the exact endpoint paths,
request bodies, and response shapes.**

## Before you start

- Read `CLAUDE.md`. Confirm prompts 28–31 landed.

## Working tree check

`git status --porcelain` clean; list/ask about unexpected dirty files. This file is exempt.

## Codebase facts (frontend)

- **Add a tab** in `frontend/src/admin/AdminLayout.tsx`: push to `ADMIN_TABS`
  `{ to: '/admin/maintenance', label: 'Maintenance', permission: Permission.MANAGE_GLOBAL_SETTINGS }`
  (`Permission` from `@game-ledger/contract`).
- **Register the route** in `frontend/src/routes/index.tsx` under the `/admin` route group:
  `<Route path="maintenance" element={<AdminMaintenance />} />` + import the component. (Classic
  react-router v6 `<Routes>/<Route>`, not the data-router API.)
- **API layer** `frontend/src/api/admin.ts`: add functions calling the singleton `apiClient`
  (`frontend/src/api/client.ts`) — `apiClient.get/post/put/delete<T>('/api/maintenance/...')`. The
  client uses cookie auth (`credentials: 'include'`) and auto-attaches `X-CSRF-Token` on mutating
  verbs; paths are relative `/api/...`. Errors throw `ApiClientError` (`.message`).
- **Page component** `frontend/src/admin/AdminMaintenance.tsx` — model on
  `frontend/src/admin/AdminInvites.tsx` (actions + feedback) and `AdminResets.tsx` (read-only).
  Use `useToast()` from `components/ui/Toast`, `Button`/`Card`/`CardContent`/`Dialog` from
  `frontend/src/components/ui/`, `cn` from `components/ui/utils`. There is **no shared Table** — use
  the inline Tailwind table convention from `AdminInvites` (slate surfaces, indigo accent,
  emerald/red status, always paired with `dark:` variants). `window.confirm(...)` before destructive
  actions; `disabled`/`loading` on buttons during requests.

## What to do

Build `AdminMaintenance.tsx` with these sections (use `Card`s):

1. **Backups** — list (name, size, created) from `GET /api/maintenance/backups`; a "Create backup"
   button (`POST /backups`); per-row **Download** (link/anchor to
   `/api/maintenance/backups/:name/download` — a normal navigation download), **Restore** (confirm
   modal; `POST /backups/:name/restore` — note this is SUPER_ADMIN-only on the backend, so non-super
   admins may get 403: hide or disable the Restore controls unless the current user is SUPER_ADMIN,
   using the auth context the other admin pages use), and **Delete** (`DELETE /backups/:name`).
2. **Restore from upload** — a file input + "Restore" that POSTs the file to `/api/maintenance/restore`
   (SUPER_ADMIN-only; gate the UI the same way). Strong confirm copy ("this overwrites all current
   data").
3. **Export** — a "Download JSON export" button/anchor hitting `GET /api/maintenance/export`.
4. **Schedule & retention** — a form bound to `GET/PUT /api/maintenance/settings`: backup
   enabled toggle, backup cron, retention count, reindex enabled toggle, reindex cron. Save via
   `PUT /settings`; toast success/error.
5. **Run maintenance** — buttons to trigger `POST /api/maintenance/run` (`vacuum` / `reindex`), with
   loading state and result toast.

Refresh lists after mutations (`await load()`), and surface `ApiClientError.message` in toasts.

## Conventions to honor

- Match the existing admin pages exactly for layout, loading/error handling, and styling. Reuse the
  shared `ui/` primitives; no new design-system pieces.
- Gate SUPER_ADMIN-only controls in the UI using the same auth/permission context the other admin
  pages consume (don't invent a new mechanism) — but rely on the backend as the real gate.

## Tests (definition of done)

- Extend `frontend/src/admin/admin.test.tsx` (Vitest + Testing Library; `stubFetch` URL→JSON helper;
  `/api/auth/me` drives permissions). Cover:
  - The **Maintenance tab visibility** assertion in the existing `AdminLayout: tab visibility` block
    (visible with `MANAGE_GLOBAL_SETTINGS`, hidden without).
  - `AdminMaintenance` renders the backup list from a stubbed `GET /backups`, and "Create backup"
    issues `POST /api/maintenance/backups` (assert via `fetchMock.mock.calls`).
  - The settings form loads from `GET /settings` and `PUT`s on save.
  - SUPER_ADMIN-only controls (Restore/upload) are hidden for a non-super admin user.
- `pnpm test` (frontend, Vitest) passes. Run a typecheck/build if the project's pre-commit does.

## When done

1. Update frontmatter; `git mv` to `prompts/done/`.
2. Update `prompts/startnewsession.md` "Current state"/"Last session"/"Next up" to reflect that
   issue #5 (Server Maintenance) is complete, and `docs/decisions.md` for any UI decision
   (e.g. how SUPER_ADMIN gating is surfaced).
3. **One commit on `dev`** (`feat:`, no AI mention) — page, layout/route/api wiring, tests, docs,
   prompt move. Specific paths only, no push. Report hash/files/message; flag anything left for a
   follow-up (e.g. nginx `client_max_body_size`/`proxy_read_timeout` tuning for large backup
   upload/download through the ingress — call it out if not addressed).
