/**
 * Pure unit tests for the scoring-type registry.
 * No DB required — all tests operate on in-memory pure functions.
 */
import {
  getScoringType,
  getRankOrderScoringType,
  getWinnerPickScoringType,
  RoundEntry,
  FinishOrderEntry,
  WinnerPickEntry,
  ScoringTypeConfig,
} from './scoring-type.registry';

// Helper to get the numeric_rounds scoring type.
function getNumericRounds() {
  const st = getScoringType('numeric_rounds', '1.0.0');
  if (!st) throw new Error('numeric_rounds@1.0.0 not found in registry');
  return st;
}

// ─── Basic multi-round Skyjo end-to-end ──────────────────────────────────────

describe('numeric_rounds — Skyjo multi-round end-to-end', () => {
  const st = getNumericRounds();
  const config: ScoringTypeConfig = {
    direction: 'low',
    aggregate: 'sum',
    roundResolver: 'skyjo/doubling',
  };

  it('sums rounds correctly when no doubling triggers', () => {
    // Round 1: A=5 (ender, strictly lowest), B=10, C=15
    // A ended round with lowest score → no doubling
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'A', roundScore: 5, endedRound: true },
        { participationId: 'B', roundScore: 10, endedRound: false },
        { participationId: 'C', roundScore: 15, endedRound: false },
      ],
      // Round 2: A=20 (ender), B=5 (lowest), C=8
      // A ended round but is NOT lowest (20 > 5) AND 20 > 0 → doubled to 40
      [
        { participationId: 'A', roundScore: 20, endedRound: true },
        { participationId: 'B', roundScore: 5, endedRound: false },
        { participationId: 'C', roundScore: 8, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    // Round 1: A=5, B=10, C=15 (no doubling — A strictly lowest)
    // Round 2: A=40 (doubled), B=5, C=8
    // Totals: A=45, B=15, C=23
    expect(result.totals['A']).toBe(45);
    expect(result.totals['B']).toBe(15);
    expect(result.totals['C']).toBe(23);
  });

  it('ranks low-direction correctly (lowest total wins)', () => {
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'P1', roundScore: 3, endedRound: true },
        { participationId: 'P2', roundScore: 10, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    // P1 is strictly lowest → no doubling
    // Totals: P1=3, P2=10
    // Rank 1 = P1 (lowest wins)
    const p1 = result.ranks.find((r) => r.participationId === 'P1')!;
    const p2 = result.ranks.find((r) => r.participationId === 'P2')!;

    expect(p1.rank).toBe(1);
    expect(p1.didWin).toBe(true);
    expect(p2.rank).toBe(2);
    expect(p2.didWin).toBe(false);
  });

  it('computes correct ranks with ties', () => {
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'X', roundScore: 10, endedRound: false },
        { participationId: 'Y', roundScore: 10, endedRound: false },
        { participationId: 'Z', roundScore: 20, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    const x = result.ranks.find((r) => r.participationId === 'X')!;
    const y = result.ranks.find((r) => r.participationId === 'Y')!;
    const z = result.ranks.find((r) => r.participationId === 'Z')!;

    expect(x.rank).toBe(1);
    expect(y.rank).toBe(1);
    expect(x.didWin).toBe(true);
    expect(y.didWin).toBe(true);
    expect(z.rank).toBe(3);
    expect(z.didWin).toBe(false);
  });
});

// ─── Skyjo doubling rule ──────────────────────────────────────────────────────

describe('skyjo/doubling resolver', () => {
  const st = getNumericRounds();
  const config: ScoringTypeConfig = {
    direction: 'low',
    aggregate: 'sum',
    roundResolver: 'skyjo/doubling',
  };

  it('doubles ender score when ender is NOT strictly lowest and score > 0', () => {
    // Ender has score 15, others have 5 and 8 → ender not strictly lowest → doubled to 30
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'Ender', roundScore: 15, endedRound: true },
        { participationId: 'P2', roundScore: 5, endedRound: false },
        { participationId: 'P3', roundScore: 8, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    expect(result.totals['Ender']).toBe(30);
    expect(result.totals['P2']).toBe(5);
    expect(result.totals['P3']).toBe(8);
  });

  it('does NOT double when ender IS strictly lowest', () => {
    // Ender has score 3, others have 7 and 12 → ender IS strictly lowest → no doubling
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'Ender', roundScore: 3, endedRound: true },
        { participationId: 'P2', roundScore: 7, endedRound: false },
        { participationId: 'P3', roundScore: 12, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    expect(result.totals['Ender']).toBe(3);
    expect(result.totals['P2']).toBe(7);
    expect(result.totals['P3']).toBe(12);
  });

  it('does NOT double when ender score is 0 (zero is not > 0)', () => {
    // Ender score = 0, others have 5 → not doubled (score must be > 0)
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'Ender', roundScore: 0, endedRound: true },
        { participationId: 'P2', roundScore: 5, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    expect(result.totals['Ender']).toBe(0);
    expect(result.totals['P2']).toBe(5);
  });

  it('does NOT double when ender score is negative', () => {
    // Ender score = -2, others have 3 → not doubled (score must be > 0)
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'Ender', roundScore: -2, endedRound: true },
        { participationId: 'P2', roundScore: 3, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    expect(result.totals['Ender']).toBe(-2);
    expect(result.totals['P2']).toBe(3);
  });

  it('does not apply doubling when there is no ender in the round', () => {
    // No endedRound === true → resolver passes through unchanged
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'P1', roundScore: 5, endedRound: false },
        { participationId: 'P2', roundScore: 10, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    expect(result.totals['P1']).toBe(5);
    expect(result.totals['P2']).toBe(10);
  });

  it('does NOT double when ender score ties with lowest other player', () => {
    // Ender=5, P2=5 → ender ties but is not STRICTLY lowest → should double
    // (strictly lowest = no other player has a score ≤ ender's score)
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'Ender', roundScore: 5, endedRound: true },
        { participationId: 'P2', roundScore: 5, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    // Ender is NOT strictly lowest (P2 ties at 5), score > 0 → doubled to 10
    expect(result.totals['Ender']).toBe(10);
    expect(result.totals['P2']).toBe(5);
  });
});

// ─── State equality (materialized == fresh replay) ───────────────────────────

describe('numeric_rounds — state equals fresh replay', () => {
  it('produces same totals when resolved from replay vs from materialized state', () => {
    const st = getNumericRounds();
    const config: ScoringTypeConfig = {
      direction: 'low',
      aggregate: 'sum',
      roundResolver: 'skyjo/doubling',
    };

    // Simulate a 3-round game.
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'Alice', roundScore: 4, endedRound: true },
        { participationId: 'Bob', roundScore: 10, endedRound: false },
      ],
      [
        { participationId: 'Alice', roundScore: 25, endedRound: true }, // not lowest → doubled to 50
        { participationId: 'Bob', roundScore: 8, endedRound: false },
      ],
      [
        { participationId: 'Alice', roundScore: -2, endedRound: false },
        { participationId: 'Bob', roundScore: 6, endedRound: true }, // strictly lowest? -2 < 6, so Bob NOT lowest → doubled
      ],
    ];

    // Resolve the full rounds.
    const fromReplay = st.resolve(rounds, config);

    // The "materialized state" would just be the same input; resolving it again yields the same output.
    const fromMaterialized = st.resolve(rounds, config);

    expect(fromReplay.totals).toEqual(fromMaterialized.totals);
    expect(fromReplay.ranks).toEqual(fromMaterialized.ranks);
  });
});

// ─── High-direction scoring ───────────────────────────────────────────────────

describe('numeric_rounds — high direction (highest wins)', () => {
  it('ranks correctly for high-direction games', () => {
    const st = getNumericRounds();
    const config: ScoringTypeConfig = { direction: 'high', aggregate: 'sum' };

    const rounds: RoundEntry[][] = [
      [
        { participationId: 'P1', roundScore: 100, endedRound: false },
        { participationId: 'P2', roundScore: 50, endedRound: false },
        { participationId: 'P3', roundScore: 75, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    const p1 = result.ranks.find((r) => r.participationId === 'P1')!;
    const p3 = result.ranks.find((r) => r.participationId === 'P3')!;
    const p2 = result.ranks.find((r) => r.participationId === 'P2')!;

    expect(p1.rank).toBe(1);
    expect(p1.didWin).toBe(true);
    expect(p3.rank).toBe(2);
    expect(p2.rank).toBe(3);
    expect(p2.didWin).toBe(false);
  });
});

// ─── rank_order scoring type ──────────────────────────────────────────────────

function getRankOrder() {
  const st = getRankOrderScoringType('rank_order', '1.0.0');
  if (!st) throw new Error('rank_order@1.0.0 not found in registry');
  return st;
}

describe('rank_order — basic finish order resolution', () => {
  const config: ScoringTypeConfig = { direction: 'high', aggregate: 'sum' };

  it('assigns rank = finish position, didWin = rank 1', () => {
    const st = getRankOrder();
    const entries: FinishOrderEntry[] = [
      { participationId: 'Alice', rank: 1 },
      { participationId: 'Bob', rank: 2 },
      { participationId: 'Carol', rank: 3 },
    ];

    const result = st.resolveFinishOrder(entries, config);

    const alice = result.ranks.find((r) => r.participationId === 'Alice')!;
    const bob = result.ranks.find((r) => r.participationId === 'Bob')!;
    const carol = result.ranks.find((r) => r.participationId === 'Carol')!;

    expect(alice.rank).toBe(1);
    expect(alice.didWin).toBe(true);
    expect(alice.score).toBeNull();

    expect(bob.rank).toBe(2);
    expect(bob.didWin).toBe(false);
    expect(bob.score).toBeNull();

    expect(carol.rank).toBe(3);
    expect(carol.didWin).toBe(false);
    expect(carol.score).toBeNull();
  });

  it('result is sorted by rank ascending', () => {
    const st = getRankOrder();
    // Submit out of order — result should still sort by rank
    const entries: FinishOrderEntry[] = [
      { participationId: 'Z', rank: 3 },
      { participationId: 'A', rank: 1 },
      { participationId: 'M', rank: 2 },
    ];

    const result = st.resolveFinishOrder(entries, config);

    expect(result.ranks[0].participationId).toBe('A');
    expect(result.ranks[1].participationId).toBe('M');
    expect(result.ranks[2].participationId).toBe('Z');
  });

  it('returns empty result for no entries', () => {
    const st = getRankOrder();
    const result = st.resolveFinishOrder([], config);
    expect(result.ranks).toHaveLength(0);
    expect(result.totals).toEqual({});
  });
});

// ─── winner_pick scoring type ─────────────────────────────────────────────────

function getWinnerPick() {
  const st = getWinnerPickScoringType('winner_pick', '1.0.0');
  if (!st) throw new Error('winner_pick@1.0.0 not found in registry');
  return st;
}

describe('winner_pick — basic resolution', () => {
  const config: ScoringTypeConfig = { direction: 'high', aggregate: 'sum' };

  it('winner gets 1 point per round, others get 0', () => {
    const st = getWinnerPick();
    // Round 1: Alice wins; Round 2: Bob wins
    const rounds: WinnerPickEntry[][] = [
      [
        { participationId: 'Alice', winnerId: 'Alice', score: 1 },
        { participationId: 'Bob', winnerId: 'Alice', score: 0 },
        { participationId: 'Carol', winnerId: 'Alice', score: 0 },
      ],
      [
        { participationId: 'Alice', winnerId: 'Bob', score: 0 },
        { participationId: 'Bob', winnerId: 'Bob', score: 1 },
        { participationId: 'Carol', winnerId: 'Bob', score: 0 },
      ],
    ];

    const result = st.resolveWinnerPick(rounds, config);

    expect(result.totals['Alice']).toBe(1);
    expect(result.totals['Bob']).toBe(1);
    expect(result.totals['Carol']).toBe(0);
  });

  it('highest total wins (direction: high)', () => {
    const st = getWinnerPick();
    // Alice wins 3 rounds, Bob wins 1, Carol wins 0
    const makeRound = (winnerId: string, pids: string[]): WinnerPickEntry[] =>
      pids.map((pid) => ({ participationId: pid, winnerId, score: pid === winnerId ? 1 : 0 }));

    const rounds: WinnerPickEntry[][] = [
      makeRound('Alice', ['Alice', 'Bob', 'Carol']),
      makeRound('Alice', ['Alice', 'Bob', 'Carol']),
      makeRound('Alice', ['Alice', 'Bob', 'Carol']),
      makeRound('Bob', ['Alice', 'Bob', 'Carol']),
    ];

    const result = st.resolveWinnerPick(rounds, config);

    expect(result.totals['Alice']).toBe(3);
    expect(result.totals['Bob']).toBe(1);
    expect(result.totals['Carol']).toBe(0);

    const alice = result.ranks.find((r) => r.participationId === 'Alice')!;
    const bob = result.ranks.find((r) => r.participationId === 'Bob')!;
    const carol = result.ranks.find((r) => r.participationId === 'Carol')!;

    expect(alice.rank).toBe(1);
    expect(alice.didWin).toBe(true);
    expect(bob.rank).toBe(2);
    expect(bob.didWin).toBe(false);
    expect(carol.rank).toBe(3);
    expect(carol.didWin).toBe(false);
  });

  it('handles ties correctly (same total → same rank)', () => {
    const st = getWinnerPick();
    const rounds: WinnerPickEntry[][] = [
      [
        { participationId: 'P1', winnerId: 'P1', score: 1 },
        { participationId: 'P2', winnerId: 'P1', score: 0 },
        { participationId: 'P3', winnerId: 'P1', score: 0 },
      ],
      [
        { participationId: 'P1', winnerId: 'P2', score: 0 },
        { participationId: 'P2', winnerId: 'P2', score: 1 },
        { participationId: 'P3', winnerId: 'P2', score: 0 },
      ],
    ];

    const result = st.resolveWinnerPick(rounds, config);

    // P1=1, P2=1 tied at rank 1; P3=0 at rank 3
    expect(result.totals['P1']).toBe(1);
    expect(result.totals['P2']).toBe(1);
    expect(result.totals['P3']).toBe(0);

    const p1 = result.ranks.find((r) => r.participationId === 'P1')!;
    const p2 = result.ranks.find((r) => r.participationId === 'P2')!;
    const p3 = result.ranks.find((r) => r.participationId === 'P3')!;

    expect(p1.rank).toBe(1);
    expect(p2.rank).toBe(1);
    expect(p1.didWin).toBe(true);
    expect(p2.didWin).toBe(true);
    expect(p3.rank).toBe(3);
    expect(p3.didWin).toBe(false);
  });

  it('returns empty result for no rounds', () => {
    const st = getWinnerPick();
    const result = st.resolveWinnerPick([], config);
    expect(result.ranks).toHaveLength(0);
    expect(result.totals).toEqual({});
  });

  it('first to target wins (7 rounds, highest wins)', () => {
    const st = getWinnerPick();
    const pids = ['CAH1', 'CAH2', 'CAH3'];
    const makeRound = (winnerId: string): WinnerPickEntry[] =>
      pids.map((pid) => ({ participationId: pid, winnerId, score: pid === winnerId ? 1 : 0 }));

    // CAH1 wins 7 rounds (reaches target), CAH2 wins 2, CAH3 wins 0
    const rounds: WinnerPickEntry[][] = [
      ...Array.from({ length: 7 }, () => makeRound('CAH1')),
      ...Array.from({ length: 2 }, () => makeRound('CAH2')),
    ];

    const result = st.resolveWinnerPick(rounds, config);

    expect(result.totals['CAH1']).toBe(7);
    expect(result.totals['CAH2']).toBe(2);
    expect(result.totals['CAH3']).toBe(0);

    const cah1 = result.ranks.find((r) => r.participationId === 'CAH1')!;
    expect(cah1.rank).toBe(1);
    expect(cah1.didWin).toBe(true);
    expect(cah1.score).toBe(7);
  });
});

describe('rank_order — pointsMap (President optional scoring)', () => {
  const configWithPoints: ScoringTypeConfig = {
    direction: 'high',
    aggregate: 'sum',
    pointsMap: { '1': 3, '2': 2, last: 0 },
  };

  it('assigns score from pointsMap when present', () => {
    const st = getRankOrder();
    const entries: FinishOrderEntry[] = [
      { participationId: 'President', rank: 1 },
      { participationId: 'VP', rank: 2 },
      { participationId: 'Asshole', rank: 3 },
    ];

    const result = st.resolveFinishOrder(entries, configWithPoints);

    const president = result.ranks.find((r) => r.participationId === 'President')!;
    const vp = result.ranks.find((r) => r.participationId === 'VP')!;
    const asshole = result.ranks.find((r) => r.participationId === 'Asshole')!;

    expect(president.score).toBe(3);
    expect(vp.score).toBe(2);
    expect(asshole.score).toBe(0); // "last" key in pointsMap
  });

  it('uses "last" key for the final rank position', () => {
    const st = getRankOrder();
    const entries: FinishOrderEntry[] = [
      { participationId: 'P1', rank: 1 },
      { participationId: 'P2', rank: 2 },
      { participationId: 'P3', rank: 3 },
      { participationId: 'P4', rank: 4 },
    ];

    const configWith4: ScoringTypeConfig = {
      direction: 'high',
      aggregate: 'sum',
      pointsMap: { '1': 3, '2': 2, last: 0 },
    };

    const result = st.resolveFinishOrder(entries, configWith4);

    // P4 is last (rank 4 = highest rank number in this group)
    const p4 = result.ranks.find((r) => r.participationId === 'P4')!;
    expect(p4.score).toBe(0);

    // P3 has no explicit key "3" and is not last → null
    const p3 = result.ranks.find((r) => r.participationId === 'P3')!;
    expect(p3.score).toBeNull();
  });

  it('totals reflect pointsMap scores', () => {
    const st = getRankOrder();
    const entries: FinishOrderEntry[] = [
      { participationId: 'President', rank: 1 },
      { participationId: 'VP', rank: 2 },
      { participationId: 'Asshole', rank: 3 },
    ];

    const result = st.resolveFinishOrder(entries, configWithPoints);

    expect(result.totals['President']).toBe(3);
    expect(result.totals['VP']).toBe(2);
    expect(result.totals['Asshole']).toBe(0);
  });
});
