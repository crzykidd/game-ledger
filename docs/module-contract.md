# Module contract

> The concrete shape of a game module. The core app depends on **this contract**, never on
> any specific game (`docs/spec.md` → "Game model"). A module is primarily a **declarative
> definition** (data) plus an **optional code resolver/component** for the few games that need
> it. Notation below is pseudo-JSON/YAML — the actual serialization (JSON vs YAML) is a stack
> decision; the *shape* is the contract.

## Why this exists

The games catalog (`docs/games/catalog.md`) proved we need to represent ~7 capture shapes and
4 result types without a DB migration per game. This contract is how: a module declares *what*
it captures and *how* it resolves, the core stores it generically (`game_events` →
`score_entries` JSON → `results`), and adding a game = adding a definition, not code.

## Scoring types — the code registry modules reference

The capture/resolution shapes below are not re-described by every module. They are **scoring
types** in a **versioned code registry** — the reusable, tested unit. A module **references a
type** and supplies config; it does not re-implement scoring.

```jsonc
ScoringType {                      // lives in CODE, versioned with the app
  id: string,                      // "numeric_rounds", "rank_order", "elimination", …
  version: string,
  turnSchema: Field[],             // the shape of a turn record (→ game_events.payload)
  capture: CaptureSpec,            // how turns are entered/structured
  resolve(turns, config): Result   // validate + aggregate + produce normalized result
}
```

- **Seed registry** (≈ the catalog archetypes): `numeric_single`, `numeric_rounds`,
  `numeric_running_target`, `rank_order`, `winner_pick`, `elimination`, `chips`.
- **New game with a new shape** → add a type to the registry **once** (code + docs); thereafter
  any module names it. **New game with an existing shape** → pure data, no code.
- A module references `scoringType: { id, version, config }`. Pinning the **type version** on
  the game (`games.scoring_type_version`) keeps history immutable (see `docs/data-model.md`).
- Computed/cross-player games are handled by the **type** (e.g. a `numeric_rounds` type with a
  `roundFormula`/`roundResolver` config, or a dedicated type) — so the "code" stays inside the
  registry, not scattered across modules.

> The `CaptureSpec` / `ResolutionSpec` / `ResultSpec` definitions below are **what a scoring
> type declares**. The worked examples show each game's *effective* contract (its type's
> semantics + the module's config) in one place for readability.

## Top-level shape

```jsonc
GameModule {                   // DATA — a game definition
  id: string,                  // "skyjo" — stable, used in games.module_id
  name: string,                // "Skyjo"
  version: string,             // semver — pinned per game for history (games.module_version)
  players: {
    min: int, max: int, ideal?: int,
    teams?: "none" | "fixed" | "adhoc"   // default "none"
  },

  scoringType: {               // REFERENCE into the code registry (defines capture+resolve)
    id: string, version: string,
    config?: object            // type-specific knobs: roundFormula, roundResolver, pointsMap…
  },
  end: EndConditionSpec,        // when the game is over
  result: ResultSpec,           // result type (its normalized mapping is type-driven)

  presentation?: PresentationSpec,  // default form, or custom entry/visualization
  variants?: VariantSpec[],         // player-tunable config (target score, house rules)
  history?: HistorySpec[],          // derived playgroup views (last-Asshole, streaks…)
  info?: ModuleInfoSpec             // rules/directions, official link, quick-reference
}
```

`CaptureSpec` / `ResolutionSpec` (next sections) are the **type's** internals; the module just
names the type and passes `config`. Keeping them as separate sections below shows what a type
author defines.

A module is therefore thin: **`scoringType` ref + `end` + `result`** are the heart;
`presentation`, `variants`, and `history` are optional polish. The scoring **type** carries the
`capture`/`resolution` weight.

## CaptureSpec — the 7 primitives (discriminated by `mode`)

```jsonc
CaptureSpec =
  | { mode: "single",      fields: Field[] }                      // one entry/player at game end
  | { mode: "rounds",      perRound: { fields: Field[], config?: RoundConfig[] } }
  | { mode: "rank",        capture: "finish_order" }              // ordering, no number
  | { mode: "winner_pick" }                                       // pick 1 winner/round → +1
  | { mode: "elimination", track?: "order" | "lives", lives?: int }
  | { mode: "chips",       fields: [buyIn, cashOut] }             // money in/out
```

```jsonc
Field { key: string, type: "int"|"number"|"bool"|"select"|"multiselect",
        label: string, options?: any[], min?: number, max?: number, required?: bool }

// config: per-round non-identical settings (Five Crowns' changing wild rank)
RoundConfig { round: int, set: { [key: string]: any } }   // e.g. { round: 9, set: { wildRank: "J" } }
```

| `mode` | Captures | Games |
|---|---|---|
| `single` | one number/player at end | Carcassonne, Catan (collapsed) |
| `rounds` | fields/player/round, aggregated | Uno, Gin, Flip 7, Skyjo, Five Crowns |
| `rank` | finish order | President, 3UP 3DOWN |
| `winner_pick` | round winner | Cards Against Humanity |
| `elimination` | knockout order / lives | Exploding Kittens, 5 Alive |
| `chips` | buy-in / cash-out | cash poker |

## ResolutionSpec — raw entries → totals

```jsonc
ResolutionSpec {
  direction: "high" | "low",          // who wins (REQUIRED — low for Skyjo/Five Crowns/Hearts)
  aggregate?: "sum" | "last" | "max" | "none",   // how rounds combine (default "sum")
  pointsMap?: { [rankOrKey: string]: number },   // optional: map a rank → points (President)

  // Computed scores. Pick ONE of:
  roundFormula?: ExprRef,             // per-round, per-player expr (Flip 7)
  roundResolver?: CodeRef             // per-round, gets the WHOLE round's set (Skyjo doubling)
}
```

- **Simple games need neither** `roundFormula` nor `roundResolver` — just `direction` +
  `aggregate` over a typed number field.
- **`roundFormula`** = a sandboxed expression over one player's captured fields (compute a
  number from inputs). Declarative-ish.
- **`roundResolver`** = a code hook (the escape hatch) that receives **all players' entries for
  the round** — required when scoring is **cross-player** (Skyjo's end-rounder doubling depends
  on others' scores) or otherwise too complex for an expression.
- **(decision)** the `Expr` language: a small sandboxed mini-expression vs. just always using a
  code hook. Recommend a tiny expression lib for `roundFormula`, code hook for the rest.

## EndConditionSpec

```jsonc
EndConditionSpec =
  | { type: "target",       target: int, finishRound?: bool }   // first to N; finish round in progress
  | { type: "fixed_rounds", rounds: int }                       // exactly N rounds (Five Crowns = 11)
  | { type: "elimination" }                                     // last standing
  | { type: "game_defined" }                                    // app can't detect; scorekeeper ends it
```

## ResultSpec + normalized result

```jsonc
ResultSpec { type: "numeric_total" | "ranking" | "elimination" | "chips" }
```

Whatever the type, the core derives the **universal normalized result** per participant —
`{ rank, did_win, score? }` — so cross-game stats never re-run game logic:

| result type | rank from | did_win | score? |
|---|---|---|---|
| `numeric_total` | sort totals by `direction` | rank == 1 | the total |
| `ranking` | finish order directly | rank == 1 | optional (pointsMap) |
| `elimination` | reverse knockout order | sole survivor | — |
| `chips` | net delta desc | highest net | net |

`result.type` and `capture.mode` are **independent axes** — e.g. Tichu = `capture: rank` +
trick-point fields, `result: numeric_total`. Don't collapse them into one enum.

## PresentationSpec — how a module adapts the UI

Everything a module renders is built from a **core design system**: **theme tokens** (CSS
custom properties for color/spacing/type that flip for light/dark and adapt by breakpoint) +
a **themed widget library** (ScoreBox, NumberStepper, RoundTable, TallyCounter, RankPicker,
WinnerPicker, LivesTracker, PlayerChip…). This is what guarantees a module can't drift
off-theme — it has no raw styling, only the system.

```jsonc
PresentationSpec {
  entry?: "form" | LayoutSpec | CodeRef,   // tier 1 / tier 2 / tier 3 (below)
  visualization?: CodeRef,                 // optional custom SKIN over the canonical score
  layout?: { mobile?: ..., wide?: ... }    // optional per-format overrides; else renderer adapts
}
```

**Three tiers, increasing power, all on the same design system:**

1. **Auto-form (default, zero code).** Core generates inputs from the scoring type's
   `capture.fields`. Simplest games.
2. **Declarative layout (data, no code)** — *handles "multiple score boxes," round tables,
   etc.* The module composes themed widgets bound to its fields (a grid of per-player
   ScoreBoxes, a per-round RoundTable, a TallyCounter, a RankPicker). The renderer themes it and
   adapts **mobile ↔ wide** automatically (e.g. a wide RoundTable collapses to stacked player
   cards on mobile). Covers the large majority of custom-ish layouts with no code.
3. **Custom component (code, escape hatch)** — *the cribbage board.* Referenced by id
   (`visualization: "cribbage/board"`) and **registered in the app like a scoring type** — so a
   normal new game stays pure data; only a brand-new *visual* adds code, once. The component is
   handed a **constrained SDK, not free rein**:
   - the **canonical score read/write API** — it's a **skin only**, never the source of truth
     (autosave/resume/stats all run on the canonical model regardless of the skin);
   - **theme tokens** (consumes tokens, never hardcodes colors → themes light/dark for free);
   - the **widget primitives** and **mobile/wide layout slots**.

**Consistency rule:** custom components get **tokens + primitives, not raw styling freedom.**
That single constraint lets a pegboard and a score grid look totally different while both obey
the same themes, design language, and responsive rules. Hardcoded styling is the failure mode —
prevented by exposing only tokens (+ review).

**Responsive:** tiers 1–2 adapt mobile↔wide in the renderer; tier-3 components are
breakpoint-aware via the layout slots / tokens (or ship `layout.mobile` / `layout.wide`
variants). Mobile stays optimized for fast, low-typing entry; wide can show more at once.

## ModuleInfoSpec — rules, official link, quick-reference

Module-provided **help/reference content** (data, not code). Distinct from score entry.

```jsonc
ModuleInfoSpec {
  rules?: Markdown,            // full directions page — rendered (sanitized), themed
  officialUrl?: string,        // link to the official rules/site, if any
  references?: ReferenceItem[] // compact at-a-glance aids shown WITH the score sheet
}

ReferenceItem {
  kind: "table" | "markdown" | "image",
  title?: string,             // e.g. "Farkle scoring"
  content?: Markdown,         // for table/markdown (preferred — themes for light/dark)
  src?: AssetRef,             // for image (theme-safe: SVG or light/dark variants)
  placement?: "panel" | "top" | "bottom",   // default "panel"
  defaultCollapsed?: bool     // default: collapsed on mobile, open on wide
}
```

Two purposes, two surfaces:

- **Directions page** (`rules` + `officialUrl`) — a **separate screen/tab** off the game, not
  on the score sheet. Full rules as Markdown + a link out.
- **Quick reference** (`references[]`) — the **Farkle dice chart** etc., shown near the score
  sheet for play-time glancing.

**Placement — default to a collapsible panel, not top/bottom.** A `"panel"` reference is a
**collapsible "Scoring reference"** that is **collapsed on mobile** (one tap to expand) and may
be **pinned open on the wide layout** (room beside the sheet). This avoids the mobile trade-off
where `"top"` pushes score entry down and `"bottom"` hides it below a scroll. Modules can still
force `"top"`/`"bottom"` for a specific game, but `"panel"` is the recommended default.

**Theming:** prefer `kind: "table"`/`"markdown"` (themes automatically for light/dark, stays
crisp). Images must be theme-safe — SVG, or provide light/dark variants — or they'll look wrong
in one theme.

## VariantSpec — player-tunable config

```jsonc
VariantSpec { key: string, label: string,
              type: "int"|"bool"|"select", default: any, options?: any[] }
```

Bounds what a Player may change for *their* game (target score, house-rule toggles) — config,
**not** code. e.g. Uno: `{ key: "targetScore", default: 500 }`; Flip 7 stacking toggles, etc.

## HistorySpec — derived playgroup views

```jsonc
HistorySpec { id: string, label: string,
              rollup: RollupExpr,        // over normalized results, scoped to a playgroup
              scope: "playgroup" | "global" }
```

e.g. President: `{ id: "last_asshole", label: "Last Asshole", rollup: "most_recent where
rank=last" }`, `{ id: "streak", rollup: "current_streak where rank=1" }`. The core stores
normalized results; the rollup computes the view. Resilient to roster changes (scoped to the
group, not a fixed player set).

## Storage mapping (recap from spec)

- `games.module_id` + `games.module_version` — pins the contract version for history immutability.
- `game_events` — append-only log (the write model); replayed into…
- `score_entries` — materialized JSON conforming to this module's `capture`.
- `results` — the normalized `{rank, did_win, score?}`.
- Core **validates** entered fields against `capture.fields`; it never interprets the game.

---

## Worked examples (proving coverage)

### Skyjo — `rounds`, low-wins, cross-player resolver

```jsonc
{ id: "skyjo", name: "Skyjo", version: "1.0.0", players: { min: 2, max: 8 },
  capture: { mode: "rounds", perRound: { fields: [
    { key: "roundScore", type: "int", label: "Round score" },
    { key: "endedRound", type: "bool", label: "Ended this round?" } ] } },
  resolution: { direction: "low", aggregate: "sum", roundResolver: "skyjo/doubling" },
  end: { type: "target", target: 100, finishRound: true },
  result: { type: "numeric_total" } }
// skyjo/doubling: if the ender's roundScore is not strictly lowest AND > 0, double it.
```

### President — `rank`, with last-Asshole history

```jsonc
{ id: "president", name: "President", version: "1.0.0", players: { min: 3, max: 8 },
  capture: { mode: "rank", capture: "finish_order" },
  resolution: { direction: "high", pointsMap: { "1": 3, "2": 2, "last": 0 } },
  end: { type: "game_defined" },
  result: { type: "ranking" },
  history: [
    { id: "last_asshole", label: "Last Asshole", rollup: "most_recent where rank=last", scope: "playgroup" },
    { id: "pres_streak",  label: "President streak", rollup: "current_streak where rank=1", scope: "playgroup" } ] }
```

### Cribbage — `rounds` increments, custom pegboard visualization

```jsonc
{ id: "cribbage", name: "Cribbage", version: "1.0.0", players: { min: 2, max: 4 },
  capture: { mode: "rounds", perRound: { fields: [ { key: "points", type: "int", label: "Points" } ] } },
  resolution: { direction: "high", aggregate: "sum" },
  end: { type: "target", target: 121 },
  result: { type: "numeric_total" },
  presentation: { visualization: "cribbage/board" },   // pins over a numeric score
  variants: [ { key: "target", label: "Game length", type: "select", default: 121, options: [61, 121] } ] }
```

### Flip 7 — `rounds`, computed round score via formula

```jsonc
{ id: "flip7", name: "Flip 7", version: "1.0.0", players: { min: 3, max: 18 },
  capture: { mode: "rounds", perRound: { fields: [
    { key: "numbers",  type: "multiselect", label: "Number cards", options: [0,1,2,3,4,5,6,7,8,9,10,11,12] },
    { key: "x2",       type: "bool",        label: "×2 modifier" },
    { key: "flatMods", type: "multiselect", label: "Flat modifiers", options: [2,4,6,8,10] },
    { key: "busted",   type: "bool",        label: "Busted?" } ] } },
  resolution: { direction: "high", aggregate: "sum",
    roundFormula: "busted ? 0 : (sum(numbers) * (x2 ? 2 : 1)) + sum(flatMods) + (count(distinct numbers)==7 ? 15 : 0)" },
  end: { type: "target", target: 200 },
  result: { type: "numeric_total" } }
```

### Exploding Kittens — `elimination`

```jsonc
{ id: "exploding-kittens", name: "Exploding Kittens", version: "1.0.0", players: { min: 2, max: 5 },
  capture: { mode: "elimination", track: "order" },
  resolution: { direction: "high" },
  end: { type: "elimination" },
  result: { type: "elimination" } }
```

### Cards Against Humanity — `winner_pick`

```jsonc
{ id: "cah", name: "Cards Against Humanity", version: "1.0.0", players: { min: 3, max: 20 },
  capture: { mode: "winner_pick" },
  resolution: { direction: "high", aggregate: "sum" },
  end: { type: "target", target: 7 },
  result: { type: "numeric_total" },
  variants: [ { key: "target", label: "Points to win", type: "int", default: 7 } ] }
```

### Carcassonne — `single`

```jsonc
{ id: "carcassonne", name: "Carcassonne", version: "1.0.0", players: { min: 2, max: 5 },
  capture: { mode: "single", fields: [ { key: "finalScore", type: "int", label: "Final score" } ] },
  resolution: { direction: "high" },
  end: { type: "game_defined" },
  result: { type: "numeric_total" } }
```

→ All seven capture modes and all four result types are exercised by real games, with only
two needing a code hook (Skyjo) or formula (Flip 7). **Confirms the hybrid model.**

---

## Open decisions

- [ ] Serialization: JSON vs YAML for module definitions.
- [ ] Expression language for `roundFormula` (mini sandboxed expr lib vs. always code hook).
- [ ] Code-hook (`CodeRef`) packaging: how `roundResolver` / custom components are bundled,
      discovered, and sandboxed (ties to declarative-vs-code module distribution in `spec.md`).
- [ ] Validation: JSON-Schema-validate `capture` payloads, or module-driven validators.
- [ ] `teams` support depth — defer real team scoring (Spades/Canasta) past v1?
- [ ] How `history` rollups are expressed (mini query DSL vs. code) and cached.
- [ ] Round-by-round vs. final-only entry per module (some games only need the final total).
