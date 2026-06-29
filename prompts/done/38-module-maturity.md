---
name: 38-module-maturity
status: done
created: 2026-06-28
model: sonnet
completed: 2026-06-28
result: >
  Added maturity?: 'in_dev' | 'complete' to module.schema.json, rebuilt contract dist,
  set maturity: in_dev in cribbage module.yaml, added maturity to ModuleInfo type,
  appended "· In Dev" to picker options, added In Dev Badge pill to GamePage header.
  Backend 80/80, frontend 97/97 tests pass.
---

# Task: Classify game modules as "In Dev" vs "Complete" (+ badge)

Add a maturity classification to the module contract so games can be marked **in development**
(subject to change) vs **complete** (polished/stable), and surface an **"In Dev"** badge in the UI.
Cribbage is the first in-dev module (its scoring/capture is being reworked in prompt 39).

## Before you start

- Read `CLAUDE.md` (conventions, **no AI mention in commits**, one prompt = one commit on `dev`).
  Skim `docs/module-contract.md`.
- Recent commits: cribbage feature (`ba1f7d3`, `80d5b2d`, `b827ada`), e2e migration (`d74639c`).

## Working tree check

`git status --porcelain` should show only prompt files (this one + `prompts/39-cribbage-capture.md`,
both exempt — **do NOT stage `39-...`**). Surface any other dirty files before touching.

## Codebase facts (researched — trust these)

- **Schema:** `packages/contract/src/module.schema.json` — top-level `"additionalProperties": true`,
  so a new field won't be rejected, but **add `maturity` to the schema explicitly** for documentation
  + validation: optional, `"enum": ["in_dev", "complete"]`. The contract package is **compiled to
  `dist/`** and consumed by the backend via `@game-ledger/contract`, so **rebuild the contract**
  after editing (`pnpm --filter @game-ledger/contract build`; confirm the script name).
- **Backend pass-through:** `ModuleDefinition` (`backend/src/module-loader/module-loader.service.ts`)
  has `[key: string]: unknown` and `listModulesWithPlayCounts` spreads `...mod`, so `maturity` flows
  through `GET /api/modules` automatically — no backend change needed beyond the YAML.
- **Default semantics:** missing `maturity` ⇒ treat as **`complete`** (the existing 17 modules stay
  unbadged). Only `in_dev` shows a badge. Do **not** add `maturity` to the other modules.
- **Frontend type:** `ModuleInfo` at `frontend/src/api/play.ts:112` — add
  `maturity?: 'in_dev' | 'complete'`.
- **Picker:** `frontend/src/play/StartGamePage.tsx` renders each game as a `<select>` `<option>` with
  text `"<name> (min–max)"`. You can't put a styled badge inside an `<option>`, so **append a text
  marker** for in-dev games, e.g. `"Cribbage (2–3) · In Dev"`.
- **Game page:** `frontend/src/play/GamePage.tsx` renders the module name as the heading (search the
  title/header area, ~line 970+). Add a small **"In Dev"** pill next to it when the module is in_dev.
- UI conventions: Tailwind, slate surfaces + indigo accent, paired `dark:` variants; reuse a Badge/
  pill style already in `frontend/src/components/ui/` if one exists, else a simple amber pill
  (`bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`).

## What to do

1. Add `maturity` to `module.schema.json` (optional enum `in_dev` | `complete`); rebuild the contract.
2. Set `maturity: in_dev` in `modules/cribbage/module.yaml`.
3. Add `maturity?: 'in_dev' | 'complete'` to `ModuleInfo`.
4. **Picker marker:** in `StartGamePage`, append `· In Dev` to the option label for in-dev modules.
5. **Game-page badge:** in `GamePage`, render an "In Dev" pill beside the module title when
   `moduleInfo.maturity === 'in_dev'`. (History/dashboard are out of scope for this prompt.)
6. Treat missing `maturity` as `complete` everywhere (no badge, no marker).

## Conventions to honor

- TypeScript; additive/backward-compatible. Type-only imports from `@game-ledger/contract` must use
  `import type` (Vitest won't catch a bad value-import; it white-screens the live app).

## Tests (definition of done)

- Backend: extend a module-loader spec to assert `cribbage` loads with `maturity === 'in_dev'` and a
  default module (e.g. `uno`) has `maturity` undefined; the schema still validates all modules.
- Frontend (Vitest): the game `<select>` shows the `· In Dev` marker for an in-dev module and not for
  a complete one; `GamePage` shows the "In Dev" pill for an in-dev game and not for a complete game
  (extend `play.test.tsx` / `CribbageBoard.test.tsx` GamePage-integration pattern).
- `pnpm test` (backend + frontend) green; `tsc --noEmit` clean. Per `startnewsession.md`, the full
  backend suite needs the isolated DB; new specs that mock Prisma don't.

## When done

1. Update frontmatter (`status: done`, `completed: 2026-06-28`, `result`); `git mv` to `prompts/done/`.
2. `docs/decisions.md` (newest at top): note the `maturity: in_dev | complete` field (missing =
   complete), the "In Dev" badge, and cribbage marked in_dev.
3. **One commit on `dev`** (`feat:`, no AI mention), specific paths only (schema + rebuilt contract
   dist, cribbage yaml, `play.ts`, `StartGamePage.tsx`, `GamePage.tsx`, tests, docs, moved prompt) —
   **not** `prompts/39-cribbage-capture.md`. No push. Report hash / files / message and confirm the
   exact field name + values for prompt 39.
