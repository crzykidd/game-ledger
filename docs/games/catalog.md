# Game catalog & scoring models

> Purpose: pin down **how each game actually scores** before we lock the universal schema
> and DB structure. Each game is one module; these sheets are the inputs to the module
> contract (`docs/spec.md`). Condensed format — full per-game template is `_TEMPLATE.md`.
>
> Status: **first pass complete.** All listed games have sheets (the newer/obscure ones —
> Flip 7, Skyjo, Five Crowns, 5 Alive, 3UP 3DOWN — were web-verified against official rules);
> class-mate games are listed by archetype; schema implications synthesized at the bottom.
> Exact point *values* are documented but are module config, not architecture — the
> structural models are what's locked-in enough to design the schema from.

## Scoring archetypes (the real output of this exercise)

These are the structural patterns the **universal schema must represent**. Every game maps
to one (occasionally two). If a game needs something not on this list, that's a signal the
schema needs a new primitive.

| # | Archetype | Win dir | End condition | Per-round capture | Examples |
|---|---|---|---|---|---|
| A | **Cumulative rounds, low total wins** | lowest | target score / fixed rounds | one number per player/round | Five Crowns, Skyjo, Gin Rummy, Golf, Hearts* |
| B | **Cumulative rounds, high total wins** | highest | target score / fixed rounds | one number per player/round | Flip 7, Phase 10*, Rummy |
| C | **Race to target VP** | highest | first to N | running VP total | Catan (10 VP), Cribbage (121) |
| D | **Single-tally at game end** | highest | game-defined end | additive point sources | Carcassonne, Ticket to Ride, eurogames |
| E | **Last player standing** | survive | all-but-one eliminated | elimination event only | Exploding Kittens, Poker (tourney) |
| F | **Positional ranking per round** | rank | session / fixed rounds | finish order per round | President/Asshole |
| G | **Trick/bid scoring** | varies | target / fixed rounds | tricks vs bid per round | Spades, Euchre, Wizard, Cribbage peg |
| H | **Subjective judge points** | highest | first to N / fixed | round winner chosen by judge | Cards Against Humanity |
| I | **Chip/stack value** | most chips | session end / bust | chip delta | Poker (cash) |

\* asterisks = game fits the archetype but has a notable twist (documented in its sheet).

---

## Uno (+ derivatives)

- **Archetype:** B (cumulative rounds, high total) — but **first to threshold loses-style**: you
  *accumulate* points and the **first player to 500 wins** in the standard scoring variant.
- **Players:** 2–10, ideal 4–6. Individual.
- **Win/end:** Each hand, the player who empties their hand first wins the hand and **scores
  the total value of all opponents' remaining cards**. Game ends when someone reaches **500**.
  (Common house variant: play fixed hands, lowest cards-left total wins — invert direction.)
- **Per-round capture:** the round winner + each *loser's* leftover card values (or just the
  winner's collected total). Simplest: one number per player per hand.
- **Card values:** number cards = face value (0–9); Draw Two / Reverse / Skip = **20**;
  Wild / Wild Draw Four = **50**.
- **Derivatives:** Uno Flip (light/dark sides), Uno All Wild, Uno No Mercy, house rules
  (stacking +2/+4, jump-in, 7-0 swap). These mostly change **card values & flow**, not the
  scoring *shape* → good test of "variant = module config, not new module."
- **Normalized result:** did_win = reached target / won most hands; rank by final total.
- **Schema implications:** primitive = **rounds (one number/player/round)** + a configurable
  **target score** and **win-direction** toggle. Card-value table is module config.

## Cribbage

- **Archetype:** C (race to target) + G (peg scoring). **First to 121** (or 61, short game).
- **Players:** 2 (classic), also 3, or 4 as 2 partnerships. Pegging board.
- **Win/end:** continuous scoring via **pegging** (play phase) + **hand/crib counting** (show
  phase); first to peg out at 121 wins immediately (game can end mid-hand).
- **Scoring detail:** fifteens (2), pairs (2 / pair-royal 6 / double-royal 12), runs (1/card),
  flushes (4 hand / 5 with starter), nobs (jack of starter suit, 1), heels/his-nibs (2 for
  dealer cut jack); pegging: 15s, 31, pairs, runs, last card.
- **Per-round capture:** practically, the app tracks the **running peg total per player** and
  increments; it does *not* need to model every fifteen. Capture = current score / score
  delta per hand. Optionally "skunk" (lose by >30) and "double skunk" (>60) flags.
- **Normalized result:** did_win = first to 121; rank by score; skunk = margin metric.
- **Schema implications:** primitive = **running total to target** with incremental score
  events. Could be modeled as archetype-C with free-form increments rather than fixed rounds.

## Catan (Settlers of)

- **Archetype:** C (race to target VP). **First to 10 Victory Points** wins, immediately.
- **Players:** 3–4 base (5–6 w/ extension). Individual.
- **VP sources:** settlement 1, city 2, Longest Road 2, Largest Army 2, VP dev cards 1 each.
- **Win/end:** as soon as a player hits 10 VP on their turn. No rounds; it's a running tally.
- **Per-round capture:** minimal — final VP per player, winner flagged. (A richer module could
  log VP-source breakdown, but the ledger only needs final standings + winner.)
- **Normalized result:** did_win = reached 10 first; rank by VP at game end.
- **Schema implications:** primitive = **running total to target**; capture can be as light as
  final score per player. Optional categorized VP sources (overlaps archetype D).

## Carcassonne

- **Archetype:** D (single tally at game end), with **incremental + end-game** scoring.
- **Players:** 2–5. Individual (meeples).
- **Scoring detail:** roads (1/tile), cities (2/tile + 2/pennant; 1 each if incomplete at end),
  cloisters (1 + 1/surrounding tile = up to 9), farms (3 per completed city served, scored at
  end). Points accrue during play (completed features) **and** at game end (incomplete features
  + farms).
- **Win/end:** game ends when tiles run out; highest total wins.
- **Per-round capture:** no fixed rounds — capture **final score per player** (and winner).
  Live play uses a score track; the ledger needs the final number.
- **Normalized result:** did_win = highest; full numeric ranking.
- **Schema implications:** primitive = **single final number per player** (archetype D). The
  internal scoring complexity is the *physical game's* concern, not the ledger's — strong
  example that "complex game" ≠ "complex schema."

## Asshole / President (a.k.a. Scum, Capitalism)

- **Archetype:** F (positional ranking per round). Shedding game.
- **Players:** 4–7 ideal. Individual.
- **Win/end:** each round, players finish in order (first out = President, last = Asshole/Scum).
  No inherent numeric score — it's **finish position**. Often played as a session of many
  rounds with card-exchange between rounds (President gets Asshole's best cards).
- **Per-round capture:** the **finish order** of all players (or at least 1st and last). Points
  optional: many groups assign points by rank (e.g. President 3, VP 2, … Asshole 0) and total.
- **Normalized result:** rank = finish position; did_win = President / most-rounds-won; can
  aggregate average finishing position over a session.
- **Schema implications:** primitive = **per-round ordering/ranking** (not a number). This is a
  distinct primitive from "one number per round" — important schema input. Optional points map
  on top of rank.

## Gin Rummy

- **Archetype:** A (cumulative rounds, but **high total to target wins**). **First to 100** (or
  agreed target) over multiple hands.
- **Players:** 2 (classic). Individual.
- **Scoring detail:** end a hand by **knocking** (deadwood ≤10) or **gin** (0 deadwood).
  - Knock: score = opponent's deadwood − knocker's deadwood. **Undercut** (opponent ≤ knocker):
    opponent scores the difference **+25**.
  - Gin: knocker scores opponent's full deadwood **+25** bonus.
  - End-game bonuses: **+25 (or 20) per line/box**, **+100 game bonus**, shutout/skunk doubles.
- **Per-round capture:** per hand — who went out, the **deadwood difference**, and gin/undercut
  flags. Simplest: one signed number per hand for the scoring player.
- **Normalized result:** did_win = reached target; rank by total.
- **Schema implications:** primitive = **rounds with a computed delta** + per-hand bonus flags +
  end-game bonus formula. More formula-driven than Uno → good escape-hatch candidate.

## Poker (cash & tournament)

- **Archetype:** I (chip/stack value, cash) **or** E (last standing, tournament).
- **Players:** 2–10. Individual.
- **Win/end (cash):** session-based; each player's result = **chips/money up or down** vs.
  buy-in. No "winner" per se — it's a net stack delta per player.
- **Win/end (tournament):** elimination; **last player with chips wins**; finishing positions
  may pay a prize structure.
- **Per-round capture:** cash — buy-in(s) and cash-out per player → net. Tournament — finish
  position + optional payout. *Hand-by-hand tracking is out of scope for a ledger.*
- **Normalized result:** cash — rank by net; did_win = biggest winner. Tourney — rank = finish.
- **Schema implications:** two modes. Cash = **buy-in/cash-out → net** (a money tally, not
  rounds). Tournament = **elimination ranking** (archetype E/F). Variant toggle inside one
  module, or two modules. Highlights: some "games" are really **money/elimination**, not points.

## Exploding Kittens

- **Archetype:** E (last player standing). Elimination, no points.
- **Players:** 2–5 (base; expansions to 10+). Individual.
- **Win/end:** draw an Exploding Kitten without a Defuse → eliminated. **Last player alive wins.**
  Single round; quick games often played best-of-many.
- **Per-round capture:** just the **winner** (and optionally elimination order for stats).
- **Normalized result:** did_win = sole survivor; rank = elimination order (reverse).
- **Schema implications:** primitive = **winner-only / elimination order**. The minimal possible
  schema — confirms the system must support "no numeric score at all" games.

## Cards Against Humanity

- **Archetype:** H (subjective judge points). Party game.
- **Players:** 4–20+, ideal 5–8. Rotating "Card Czar" judge.
- **Win/end:** each round the Czar picks the funniest white-card answer; that player wins the
  black card = **1 Awesome Point**. Play to an **agreed target** (e.g. first to 5–7) or "until
  bored." No objective scoring — purely the judge's pick.
- **Per-round capture:** **who won the round** (1 point). That's it.
- **Normalized result:** did_win = most Awesome Points; rank by points.
- **Schema implications:** primitive = **round-winner tally to target** (a degenerate case of
  archetype B where each round awards exactly 1 point to one player). Cheap to model; the only
  twist is there's no entered "score," just a round-winner pick.

---

## Flip 7 (The Op, 2024)

- **Archetype:** B (cumulative rounds, high total) + push-your-luck. **First to 200 wins.**
- **Players:** 3–18+ (solo mode too), ideal ~3–8. Individual.
- **Win/end:** highest cumulative total; game ends when a player crosses **200**.
- **Round structure:** push-your-luck — each turn **Hit** (flip a card) or **Stay** (bank).
  Round ends when all players are inactive (busted/stayed/frozen) **or** instantly when any
  player collects **7 unique number cards** (Flip 7).
- **Scoring (order matters):** (1) sum number cards; (2) **×2 if holding the ×2 modifier**
  (applies to number sum *only*); (3) add flat modifiers +2/+4/+6/+8/+10; (4) **+15 if Flip 7**
  (not multiplied). **Bust** (drawing a duplicate number) = **0 for the round**, lose all cards.
- **Special:** Second Chance (discard a dup instead of busting), Freeze (bank + out), Flip
  Three (flip 3 in a row). Deck: 78 number cards (count = face value, 0–12), 9 action, 7 modifier.
- **Per-round capture:** number cards collected (to detect dup/bust + count uniques), modifiers
  held (which flats + ×2), bust flag, Flip 7 flag → compute round score, else 0.
- **Tie-break:** if multiple players are >200 and tied, play extra rounds until one leader.
- **Normalized result:** did_win = first past 200 / highest; rank by total.
- **Schema implications:** primitive = **rounds (one number/player/round)**, but the number is
  *computed from a structured per-round payload* (cards + modifiers + flags) via a formula →
  this is a strong case for **declarative schema + a resolution formula** (or code hook). Not
  just "type a number": the app can compute it from inputs, which is a nicer mobile UX.

## Skyjo (Magilano)

- **Archetype:** A (cumulative rounds, low total wins). **Game ends when a player hits 100.**
- **Players:** 2–8, ideal ~3–6. Individual.
- **Win/end:** lowest cumulative total; once any player reaches **≥100**, finish the round,
  lowest total wins.
- **Round structure:** each player has a **3×4 grid (12 cards)**; swap/flip on your turn. Round
  ends when one player has all 12 face-up; everyone else takes one final turn, then reveal &
  score. Record each player's **round subtotal** (sum of 12 cards).
- **Scoring:** card value = face (−2 to 12). Distribution: −2 (×5), −1 (×10), 0 (×15), 1–12
  (×10 each). **Column removal:** 3 equal cards in a vertical column → discard column, counts 0.
- **Special — end-rounder doubling:** the player who ended the round must have the **strictly
  lowest** round score; if not, their (positive) round score is **DOUBLED**. Not applied if
  their round score is ≤0.
- **Per-round capture:** each player's round subtotal + who ended the round (to apply doubling)
  → add to cumulative; detect ≥100 game end. (Optionally the 12 card values if we compute.)
- **Tie-break:** none official (house-rule: extra rounds or shared win).
- **Normalized result:** did_win = lowest total; rank by total ascending.
- **Schema implications:** primitive = **rounds (one number/player/round)** + a **conditional
  multiplier** (the end-rounder penalty) that depends on *other players' scores in the same
  round*. That cross-player conditional is a notable schema requirement — resolution can't be
  purely per-player; it needs the round's full set.

---

## Five Crowns (PlayMonster)

- **Archetype:** A (cumulative rounds, **low total wins**). **Fixed 11 rounds.**
- **Players:** 1–7 (to 14 combining sets), ideal 2–6. Individual. Two 58-card decks, 5 suits, 6 jokers.
- **Win/end:** lowest cumulative score after **round 11** (Kings wild). No target — fixed length.
- **Round structure:** round N deals N+2 cards (R1=3 … R11=13). Rummy melding; someone "goes
  out," others get one final turn, then score **unmelded cards left in hand**.
- **Scoring (penalty for cards left):** 3–10 = face; J=11, Q=12, K=13; **Joker=50**; the round's
  **rotating wild = 20**; melded cards = 0; clean go-out = 0.
- **Wild progression (per-round config):** R1→3s, R2→4s, … R8→10s, R9→J, R10→Q, R11→K. Jokers
  always wild.
- **Per-round capture:** one integer ≥0 per player (penalty sum). Optionally enter leftover cards
  and auto-sum using the value table + which rank is wild that round.
- **Tie-break:** shared win, or a 6-card tie-breaker round among the tied (lowest wins).
- **Normalized result:** did_win = lowest total; rank ascending.
- **Schema implications:** primitive = **rounds (one number/player/round), low-wins, fixed count
  = 11**. The wild-rank-per-round is **per-round module config** — a clean example of a game whose
  rounds aren't identical (each round has a different wild), which the schema should express.

## 5 Alive (Hasbro)

- **Archetype:** J (last player standing / elimination). **No numeric score.**
- **Players:** 2–6. Individual. 108-card deck; running-total-under-21 mechanic.
- **Win/end:** each player has 5 "A-L-I-V-E" life cards; flip one when you can't play under 21
  (total resets). All 5 flipped = eliminated. **Last survivor wins.**
- **Round structure:** continuous; a shared running total (0–20) that resets on bust/special.
  Not round-scored. Special cards (=0, =10, =21, Reverse, Skip, Bomb, Draw, Redeal) alter the total/flow.
- **Per-game capture:** per player, **Alive cards remaining (0–5)** and alive/eliminated status;
  **elimination order** for the result. Shared running total is transient (not stored).
- **Normalized result:** did_win = last standing; rank = reverse elimination order.
- **Schema implications:** primitive = **elimination order / last-standing** (archetype J/E) with
  an optional **lives counter (0–5)** as live state. Confirms a "no score, track lives + knockout
  order" module shape — same family as Exploding Kittens but with a depleting life counter.

## 3UP 3DOWN (Big Potato)

- **Archetype:** F (positional finishing order). Shedding game. **No numeric score.**
- **Players:** 2–6. Individual. ~84 cards (70 numbered + Clear specials).
- **Win/end:** shed all cards — hand → 3 face-up → 3 face-down (blind). **First to empty wins;**
  remaining players continue to fill out the order (last = loser).
- **Round structure:** play a card ≥ top discard; can't play → pick up the pile. Clear / Clear+1 /
  Clear+2 cards wipe the discard pile.
- **Per-game capture:** **finishing order** (ordinal per player). No per-round numbers. For a
  session, accumulate wins or average placement.
- **Tie-break:** none — finishing order is inherently sequential.
- **Normalized result:** did_win = first out; rank = finishing order directly.
- **Schema implications:** primitive = **pure finishing-order ranking** (same as President, minus
  the optional points map). Reinforces that **rank-only** must be a first-class result type.

## Additional games by archetype (class-mates)

Not full sheets — one-line scoring models to confirm the archetypes cover the wider library
people actually own. Each is a candidate future module; none should need a new primitive.

**A — Cumulative rounds, lowest total wins (rummy/golf family)**
- Phase 10 — lowest total; unplayed cards penalize each round; ends when a player finishes all 10 phases.
- Golf (card game) — lowest total; face values accumulate, matched pairs cancel; fixed # of holes.
- Rummy 500 — melds add, hand cards subtract; first to 500 (often played lowest-deadwood).
- Continental / Kalooki — penalty points for unmelded cards across fixed contracts; lowest wins.

**B — Cumulative rounds, highest total wins**
- Canasta — melds/canastas + go-out bonuses; first partnership to 5000.
- Mille Bornes — distance + safety bonuses; first to target over multiple hands.
- Rook — point cards captured in tricks + bid; first to ~500.
- Pinochle — melds + trick points; first to 1000/1500.
- Lost Cities — expedition columns score (cost−20)×multiplier; highest over 3 rounds.
- Quiddler — word/letter points + longest-word bonuses; highest over increasing rounds.

**C — Race to a target score / VP**
- Splendor — gem-bought cards give prestige; first to 15 triggers final round.
- Sequence — form rows of 5 chips; first team to required sequences.
- Settlers spinoffs — first to 10 VP.

**D — Victory-point salad, highest at game end (eurogames)**
- 7 Wonders — military/science/civic/etc. over 3 ages; highest total.
- 7 Wonders Duel — multi-track points + instant-win (military/science).
- Sushi Go / Party — set-collection combos over 3 rounds; highest total.
- Azul — tile placement scores, floor-line penalties; highest at trigger.
- Ticket to Ride — route + ticket points (failed tickets subtract); highest at end.
- Wingspan — birds/eggs/food/bonus cards over 4 rounds; highest.
- Everdell, Terraforming Mars, Scythe, Dominion — point sources tallied at game end; highest.
- Qwirkle — lines of matching color/shape + Qwirkle bonus; highest when tiles run out.

**E — Fixed rounds, total points (dice/category)**
- Yahtzee — 13 categories filled once; highest total.
- Qwixx — mark numbered rows for points, penalties for passes; ends on locked rows/penalties.

**F — Positional ranking per round**
- Tichu — finish order **+** trick card points; first to 1000 (rank + points hybrid).
- Big Two / Deuces — first to empty hand; losers penalized by cards left.

**G — Trick-taking with bid/penalty scoring**
- Hearts — penalty points (hearts + Q♠); **lowest** wins; ends at 100. (shoot-the-moon twist)
- Spades — partnership bids tricks; make/set scoring; first to 500.
- Euchre — call-trump team must win 3+ tricks; first to 10.
- Wizard / Oh Hell — exact-bid bonus, miss penalty over increasing rounds; highest total.
- Rook, Pinochle, Bridge, 500 — bid/contract scoring; race to target.
- Scopa / Scopone — capture cards for points (settebello, primiera); first to 11/21.

**H — Subjective judge / party scoring**
- Apples to Apples — judge picks best; win green cards; first to target.
- Dixit — storyteller + guessers score by partial-clue rules; first to 30 on track.
- Codenames, Wavelength — cooperative/team race (no per-player score).

**I — Dice push-your-luck (race to target)**
- Farkle — banked combos score, no-score roll busts the turn; first to 10,000.
- Zombie Dice — collect brains, 3 shotguns bust; first to 13.
- Can't Stop — advance columns, bust loses temp progress; first to claim 3.
- Pass the Pigs — pig-position combos, "pig out" loses turn points; first to 100.

**J — Last player standing / elimination**
- Liar's Dice (Perudo) — lose dice on failed bluffs; last with dice.
- Coup — bluff away influences; last player remaining.
- LCR — dice pass chips; last with chips.
- **Monopoly** (board game) — bankrupt elimination; **last solvent player wins.** Time-limit
  variant: highest **net worth** (cash + property + buildings) → record a single final number.
  Maps to `elimination` (primary) or `numeric_single`/`chips` (net-worth variant).
- **Monopoly Deal** (card game — *different game, similar name*) — race to collect **3 complete
  property sets**; **first to the goal wins.** No numeric score; action cards alter play but not
  scoring. **Winner-only** outcome (optionally full finishing order). Maps to `rank_order` /
  winner result. **No new type needed.**

> Coverage check: every game above lands in an existing archetype. **Tichu** is the one to
> watch — it combines positional rank **and** numeric trick points, confirming the schema
> should allow a game to use **rank + a per-round number together**, not strictly one or the
> other. Cooperative games (The Mind, Codenames, Wavelength) are **out of scope** for a
> per-player-score ledger unless we add a team/co-op result mode — flag as a future decision.
>
> **Archetype ≠ scoring type.** An archetype describes how a game *feels to play*; the scoring
> **type** is only what we *store*. Many archetypes collapse to the same storage type — e.g.
> push-your-luck (Farkle, Flip 7) just records a banked number per turn (`numeric_rounds`);
> elimination and first-to-goal (Monopoly, Monopoly Deal, Exploding Kittens) record only a
> winner / knockout order. The dice-rolling, bluffing, and busting all happen *before* the
> number we save — so the storage-type set stays small even as game variety explodes.

## Schema implications — the conclusion

This is the real output of the exercise: what the universal schema and the module contract
must support, derived from real games rather than guessed.

### 1. Result types (the `normalized_result` union)

Every module, whatever it scores, must resolve to **one of these** so cross-game stats work:

| Result type | Means | Games |
|---|---|---|
| **numeric_total** | a number per player; sort asc/desc | Uno, Gin, Flip 7, Skyjo, Five Crowns, eurogames |
| **ranking** | finish order, no number required | President, 3UP 3DOWN, Tichu (+ points) |
| **elimination** | knockout order / last-standing | Exploding Kittens, 5 Alive, tourney poker |
| **chips** | net money/chip delta | cash poker |

All four collapse to **`{rank, did_win, score?}` per participant** for the stats layer.

### 2. Capture primitives (how scores get entered)

| Primitive | Shape | Games |
|---|---|---|
| **single** | one final number per player | Carcassonne, Catan (collapsible) |
| **rounds** | one number per player per round, aggregated | Uno, Gin, Flip 7, Skyjo, Five Crowns |
| **running-target** | free-form increments to a target | Cribbage (121), Catan (10 VP) |
| **rank** | finish order per round/game | President, 3UP 3DOWN |
| **winner-pick** | 1 point to a chosen player per round | Cards Against Humanity |
| **lives/elim** | depleting counter + knockout order | 5 Alive, Exploding Kittens |
| **buy-in/out** | money in vs money out | cash poker |

### 3. Cross-cutting requirements (the gotchas these games exposed)

These are the things a naive "table of numbers" schema would get wrong:

- **Win direction is per-module** (low-wins vs high-wins). Non-negotiable; Skyjo/Five
  Crowns/Hearts are low-wins, most others high.
- **End condition is per-module:** target score · fixed round count · elimination · game-defined.
  (Five Crowns is *fixed 11 rounds*, not a target — both must be expressible.)
- **Rounds aren't always identical.** Five Crowns changes the wild rank every round → the
  schema needs **per-round config**, not just a flat repeat.
- **Resolution can be cross-player, not per-player.** Skyjo's end-rounder doubling depends on
  *other* players' round scores → the resolver gets the **whole round's set**, not one player.
- **A round score can be computed from a structured payload, not typed.** Flip 7 = (cards +
  modifiers + flags) → formula. Better mobile UX (tap inputs, app computes) and argues for a
  declarative schema **with a resolution formula/hook**.
- **Rank and points can coexist.** Tichu = finish order **+** trick points. Result type and
  capture primitive are **independent axes**, not one enum.
- **Some games have no score at all.** Elimination and rank-only games must be first-class —
  the system can't assume a number exists.
- **Teams/partnerships exist.** Spades, Canasta, Bridge score by *team*. Participation needs an
  optional team grouping. (Most listed games are individual; don't over-build, but leave room.)
- **Co-op games are out of scope** (The Mind, Codenames, Wavelength) unless we add a team/co-op
  outcome — explicit non-goal for v1.

### 4. Recommendation (settles the `docs/spec.md` "declarative vs code" TODO)

The evidence points clearly at the **hybrid module model**:

- **Declarative config covers ~90%** of these games: pick a capture primitive, a value table,
  win-direction, end-condition, and per-round config. Uno, Skyjo, Five Crowns, President, CAH,
  Exploding Kittens, 3UP 3DOWN, most eurogames — all pure data, **zero code to add a game**.
- **A resolution formula/hook handles the rest:** Flip 7's compute-from-payload, Skyjo's
  cross-player doubling, Gin/Cribbage bonus math, Tichu's rank+points. Confined to the module.
- **DB stays game-agnostic:** `games(module_id, module_version)`, `score_entries` = JSON payload
  validated against the module's declared schema, `results` = the normalized `{rank, did_win,
  score?}`. **No per-game tables, no migration to add a game** — exactly the isolation goal.

This is the bridge from "what are our games" to the module contract and DB structure. When
you're ready, the next step is to turn §1–3 into the concrete module-contract schema (the
declarative format + the result/capture type definitions) and a sample module or two
(e.g. Skyjo + President) to prove it end-to-end before any DB is written.
