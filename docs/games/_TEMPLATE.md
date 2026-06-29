# Game spec sheet — `<Game Name>`

> One sheet per game. These fields are deliberately the same set of facts a **game module**
> must declare (see `docs/spec.md` → "Game model — module / plugin system"). Filling these
> out for real games is how we validate that the universal scoring schema can represent
> them all *before* we lock the DB structure.

## Identity
- **Name:**
- **Aliases / derivatives:** (e.g. Uno → variants/house rules)
- **Scoring archetype:** (see `catalog.md` → Archetypes)

## Players
- **Min–Max:**
- **Ideal:**
- **Teams?:** (individual / fixed teams / ad-hoc)

## Outcome shape
- **Win direction:** highest total · lowest total · last-standing · positional rank · most-VP
- **End condition:** target score reached · fixed N rounds · deck/hand exhausted · elimination · time
- **Result granularity:** winner-only · full ranking · numeric final scores

## Round / turn structure
- **Is there a "round" that repeats?:** yes/no — what defines it
- **Recorded per round:** what number(s)/event(s) get captured per player per round
- **Recorded per game (non-round):** any one-shot inputs

## Scoring detail
- **What generates points:** (card values, melds, VP sources, tokens, tricks…)
- **Exact values / table:** (face values, bonuses, penalties, multipliers)
- **Aggregation:** sum of rounds · last value · max · custom formula
- **Bonuses / penalties / multipliers:**
- **Bust / elimination rules:**

## Special rules & variants
- **Special cards/tiles/effects affecting score:**
- **Common house-rule variants worth supporting:**
- **Tie-break rules:**

## Data captured (UI contract)
- **Per player, per round:** (fields + types: int / number / bool / select)
- **Per game:** (settings: target score, round count, variant toggles)
- **Minimum-typing shortcut:** (what's the fastest mobile entry path?)

## Normalized result (cross-game stats bridge)
- **did_win:** how determined
- **rank:** how determined
- **normalized_score (optional):** is a comparable score meaningful across plays?

## Schema implications
- **Primitive(s) needed:** single · rounds · tally · ranking · vp-categories · custom-hook
- **Anything the generic schema can't yet express:** (drives schema design)
- **Notes / edge cases:**
