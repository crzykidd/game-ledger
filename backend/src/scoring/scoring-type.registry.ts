/**
 * In-code scoring-type registry.
 *
 * Each ScoringType is a pure-TS computation with no DB coupling. The registry
 * maps `${id}@${version}` keys to implementations. New scoring types are added
 * here; the module loader references them by id+version from the YAML.
 *
 * Registered types:
 *   numeric_rounds — round-based numeric scoring (Skyjo, Uno, Five Crowns)
 *   winner_pick    — round winner accumulator (Cards Against Humanity, Apples to Apples)
 *   rank_order     — finish-order ranking (President)
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

/** One player's contribution to a round. */
export interface RoundEntry {
  participationId: string;
  roundScore: number;
  endedRound: boolean;
}

/**
 * One player's finish position in a rank_order game.
 * `rank` is 1-based (1 = first place / winner).
 */
export interface FinishOrderEntry {
  participationId: string;
  rank: number; // 1 = first place
}

/** Configuration stored in the module YAML under scoringType.config. */
export interface ScoringTypeConfig {
  direction: 'high' | 'low';
  aggregate: 'sum' | 'last';
  /** Optional resolver key like "skyjo/doubling". */
  roundResolver?: string;
  /** Optional points map for rank_order: maps rank (as string key, e.g. "1", "2", "last") → points. */
  pointsMap?: Record<string, number>;
}

/**
 * One round's winner entry for winner_pick games.
 * Each round, exactly one participant is the winner (score = 1); all others score 0.
 */
export interface WinnerPickEntry {
  participationId: string;
  /** The winner of this round — the participation ID who gets the +1. */
  winnerId: string;
  /** 1 if this participant won the round, 0 otherwise. */
  score: number;
}

/** A scoring type implementation for winner_pick games. */
export interface WinnerPickScoringType {
  id: string;
  version: string;
  /** Resolve winner_pick rounds into cumulative totals + ranks. */
  resolveWinnerPick(rounds: WinnerPickEntry[][], config: ScoringTypeConfig): ResolvedResult;
}

/** Rank entry in a resolved result. */
export interface RankEntry {
  participationId: string;
  rank: number;
  didWin: boolean;
  score: number | null;
}

/** Output of ScoringType.resolve(). */
export interface ResolvedResult {
  totals: Record<string, number>;
  ranks: RankEntry[];
}

/** A scoring type implementation. */
export interface ScoringType {
  id: string;
  version: string;
  resolve(rounds: RoundEntry[][], config: ScoringTypeConfig): ResolvedResult;
}

/**
 * rank_order scoring type input — a single finish order (M1: one per game).
 * Separate from ScoringType.resolve() signature; handled via resolveRankOrder().
 */
export interface RankOrderScoringType {
  id: string;
  version: string;
  resolveFinishOrder(entries: FinishOrderEntry[], config: ScoringTypeConfig): ResolvedResult;
}

// ─── Round resolvers ──────────────────────────────────────────────────────────

/**
 * Round resolvers transform per-round scores before aggregation.
 * Key = resolver identifier (e.g. "skyjo/doubling").
 */
type RoundResolver = (round: RoundEntry[]) => RoundEntry[];

/**
 * Skyjo end-rounder doubling rule.
 *
 * For the player who ended the round (endedRound === true):
 * - If their roundScore > 0 AND they are NOT the strictly lowest scorer → double it.
 * - Otherwise apply as-is.
 */
function skyjoDoublingResolver(round: RoundEntry[]): RoundEntry[] {
  const ender = round.find((e) => e.endedRound);
  if (!ender) return round;

  // Ender IS strictly lowest iff every other player has a score strictly greater than ender's.
  const othersScores = round
    .filter((e) => e.participationId !== ender.participationId)
    .map((e) => e.roundScore);
  const enderIsStrictlyLowest = othersScores.every((s) => s > ender.roundScore);

  const shouldDouble = ender.roundScore > 0 && !enderIsStrictlyLowest;

  if (!shouldDouble) return round;

  return round.map((entry) => {
    if (entry.participationId === ender.participationId) {
      return { ...entry, roundScore: entry.roundScore * 2 };
    }
    return entry;
  });
}

const ROUND_RESOLVERS: Record<string, RoundResolver> = {
  'skyjo/doubling': skyjoDoublingResolver,
};

// ─── numeric_rounds scoring type ─────────────────────────────────────────────

/**
 * `numeric_rounds` — the standard round-based numeric scoring type.
 *
 * Each round contributes one number per participant. Supports:
 * - `aggregate: sum` (running total) or `aggregate: last` (only the last round counts).
 * - Optional `roundResolver` hook that can mutate round scores before aggregation
 *   (cross-player rules like Skyjo doubling).
 * - `direction: low` means lowest total wins; `direction: high` means highest.
 */
const numericRoundsScoringType: ScoringType = {
  id: 'numeric_rounds',
  version: '1.0.0',

  resolve(rounds: RoundEntry[][], config: ScoringTypeConfig): ResolvedResult {
    const resolver = config.roundResolver ? ROUND_RESOLVERS[config.roundResolver] : undefined;

    // Apply resolver if present, then accumulate.
    const processedRounds = rounds.map((round) => (resolver ? resolver(round) : round));

    // Collect all participation IDs.
    const participationIds = new Set<string>();
    for (const round of processedRounds) {
      for (const entry of round) {
        participationIds.add(entry.participationId);
      }
    }

    // Compute totals per participant.
    const totals: Record<string, number> = {};
    for (const pid of participationIds) {
      totals[pid] = 0;
    }

    if (config.aggregate === 'sum') {
      for (const round of processedRounds) {
        for (const entry of round) {
          totals[entry.participationId] = (totals[entry.participationId] ?? 0) + entry.roundScore;
        }
      }
    } else if (config.aggregate === 'last') {
      // Only the last round counts — zero out and apply the last round.
      const lastRound = processedRounds[processedRounds.length - 1];
      if (lastRound) {
        for (const entry of lastRound) {
          totals[entry.participationId] = entry.roundScore;
        }
      }
    }

    // Rank by total (direction: low → ascending; high → descending).
    const sorted = Object.entries(totals).sort(([, a], [, b]) =>
      config.direction === 'low' ? a - b : b - a,
    );

    let currentRank = 1;
    const ranks: RankEntry[] = [];
    for (let i = 0; i < sorted.length; i++) {
      // Handle ties — same score → same rank.
      if (i > 0 && sorted[i][1] !== sorted[i - 1][1]) {
        currentRank = i + 1;
      }
      const [participationId, score] = sorted[i];
      ranks.push({
        participationId,
        rank: currentRank,
        didWin: currentRank === 1,
        score,
      });
    }

    return { totals, ranks };
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, ScoringType>();

function register(st: ScoringType): void {
  registry.set(`${st.id}@${st.version}`, st);
}

/** Look up a scoring type by id + version. Returns undefined if not found. */
export function getScoringType(id: string, version: string): ScoringType | undefined {
  return registry.get(`${id}@${version}`);
}

/** All registered scoring types (for diagnostics). */
export function listScoringTypes(): ScoringType[] {
  return Array.from(registry.values());
}

// Register built-in types.
register(numericRoundsScoringType);

// ─── rank_order scoring type ──────────────────────────────────────────────────

/**
 * `rank_order` — finish-order ranking.
 *
 * Capture = a finish order (FinishOrderEntry[]). Produces a normalized result
 * where rank = finish position, didWin = rank 1, score = optional pointsMap value.
 *
 * For M1 this is single-round (one finish order per game). The standard
 * ScoringType.resolve() interface is satisfied with a no-op (rank_order games
 * use resolveFinishOrder directly from the service layer).
 */
export const rankOrderScoringType: RankOrderScoringType & {
  id: string;
  version: string;
} = {
  id: 'rank_order',
  version: '1.0.0',

  resolveFinishOrder(entries: FinishOrderEntry[], config: ScoringTypeConfig): ResolvedResult {
    if (entries.length === 0) {
      return { totals: {}, ranks: [] };
    }

    // Sort ascending by rank (1 = first place)
    const sorted = [...entries].sort((a, b) => a.rank - b.rank);
    const lastRank = sorted[sorted.length - 1].rank;

    const ranks: RankEntry[] = sorted.map((entry) => {
      let score: number | null = null;
      if (config.pointsMap) {
        // Try rank key first, then "last" for the final position
        const rankKey = String(entry.rank);
        if (rankKey in config.pointsMap) {
          score = config.pointsMap[rankKey];
        } else if (entry.rank === lastRank && 'last' in config.pointsMap) {
          score = config.pointsMap['last'];
        }
      }
      return {
        participationId: entry.participationId,
        rank: entry.rank,
        didWin: entry.rank === 1,
        score,
      };
    });

    // totals: use score from pointsMap if present, else 0
    const totals: Record<string, number> = {};
    for (const r of ranks) {
      totals[r.participationId] = r.score ?? 0;
    }

    return { totals, ranks };
  },
};

// Registry for rank_order (stored separately since it uses a different resolve signature)
const rankOrderRegistry = new Map<string, RankOrderScoringType & { id: string; version: string }>();
rankOrderRegistry.set(
  `${rankOrderScoringType.id}@${rankOrderScoringType.version}`,
  rankOrderScoringType,
);

/** Look up a rank_order scoring type by id + version. */
export function getRankOrderScoringType(
  id: string,
  version: string,
): (RankOrderScoringType & { id: string; version: string }) | undefined {
  return rankOrderRegistry.get(`${id}@${version}`);
}

// ─── winner_pick scoring type ─────────────────────────────────────────────────

/**
 * `winner_pick` — round-winner accumulator.
 *
 * Each round, exactly one participant is selected as the winner and earns +1.
 * All other participants score 0. Totals accumulate across rounds.
 * Highest total wins (direction: high). End condition is typically a target score.
 *
 * Capture events use type "winner_pick" with payload { round, winnerId }.
 * The service layer converts winner_pick events into WinnerPickEntry[][] for
 * this resolver.
 */
export const winnerPickScoringType: WinnerPickScoringType & {
  id: string;
  version: string;
} = {
  id: 'winner_pick',
  version: '1.0.0',

  resolveWinnerPick(rounds: WinnerPickEntry[][], config: ScoringTypeConfig): ResolvedResult {
    if (rounds.length === 0) {
      return { totals: {}, ranks: [] };
    }

    // Collect all participation IDs.
    const participationIds = new Set<string>();
    for (const round of rounds) {
      for (const entry of round) {
        participationIds.add(entry.participationId);
      }
    }

    // Accumulate totals — each round adds 1 to the winner, 0 to others.
    const totals: Record<string, number> = {};
    for (const pid of participationIds) {
      totals[pid] = 0;
    }
    for (const round of rounds) {
      for (const entry of round) {
        totals[entry.participationId] = (totals[entry.participationId] ?? 0) + entry.score;
      }
    }

    // winner_pick is always high-wins (most Awesome Points wins).
    const direction = config.direction ?? 'high';
    const sorted = Object.entries(totals).sort(([, a], [, b]) =>
      direction === 'low' ? a - b : b - a,
    );

    let currentRank = 1;
    const ranks: RankEntry[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i][1] !== sorted[i - 1][1]) {
        currentRank = i + 1;
      }
      const [participationId, score] = sorted[i];
      ranks.push({
        participationId,
        rank: currentRank,
        didWin: currentRank === 1,
        score,
      });
    }

    return { totals, ranks };
  },
};

// Registry for winner_pick (separate from standard ScoringType registry — different resolve signature).
const winnerPickRegistry = new Map<
  string,
  WinnerPickScoringType & { id: string; version: string }
>();
winnerPickRegistry.set(
  `${winnerPickScoringType.id}@${winnerPickScoringType.version}`,
  winnerPickScoringType,
);

/** Look up a winner_pick scoring type by id + version. */
export function getWinnerPickScoringType(
  id: string,
  version: string,
): (WinnerPickScoringType & { id: string; version: string }) | undefined {
  return winnerPickRegistry.get(`${id}@${version}`);
}
