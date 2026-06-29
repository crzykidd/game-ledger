---
name: NN-short-description
status: pending          # pending | completed | failed
created: YYYY-MM-DD
model:                   # opus = research/planning, sonnet = coding
completed:               # filled when the work is done
result:                  # one-line summary of the outcome
---

# Task: <short imperative title>

<One or two sentences: what this task accomplishes and why.>

## Before you start

- Read `CLAUDE.md` (stack, conventions, commit rules) and the relevant `docs/` for this task.
- Match existing conventions; reuse what prior prompts established (don't re-scaffold).

## Working tree check

Run `git status --porcelain` and cross-reference the files this plan modifies. If any have
uncommitted changes you didn't make, list them and ask before touching. This prompt file is
exempt (it's expected to move per "When done").

## What to do

1. <Step.>
2. <Step.>

## Conventions to honor

- Stack/structure per `CLAUDE.md`. TypeScript throughout; shared types in `packages/contract`.
- <Style / structure expectations for this task.>

## Tests (definition of done)

- Write **unit tests for the logic this prompt adds**; they must pass before committing.
- <Specific things to cover.>

## When done

1. Update this file's frontmatter: `status` (completed/failed), `completed` (date), `result`.
2. `git mv` this file into `prompts/done/` (success) or `prompts/failed/` (failure). Create the
   subdir if needed.
3. Record any non-obvious decisions in `docs/decisions.md` (newest at top).
4. **Commit on `dev`** — ONE commit covering this prompt's work, its tests, and the prompt-file
   move. Conventional-Commits message (`feat:`/`fix:`/`chore:`/`docs:`), **no Claude/AI mention,
   no `Co-authored-by`, no `Claude-Session`**. Stage only the specific paths (never `git add -A`),
   do not push. Then **report back** what you committed (hash, files, message) and anything the
   next prompt should know.
