/**
 * Unit tests for the cribbage game module.
 *
 * Verifies:
 *   1. The module loads and is registered with the expected metadata.
 *   2. numeric_rounds.resolve() produces correct totals and rankings for a
 *      3-player cribbage-style (high/sum) game.
 *
 * All Prisma calls are mocked — no DB required.
 */
import * as path from 'path';
import { ModuleLoaderService } from './module-loader.service';
import {
  getScoringType,
  RoundEntry,
  ScoringTypeConfig,
} from '../scoring/scoring-type.registry';

const MODULES_DIR = path.resolve(__dirname, '../../../modules');

// ─── Fake PrismaService ───────────────────────────────────────────────────────

function makePrisma() {
  return {
    gameModule: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    game: {
      groupBy: jest.fn().mockResolvedValue([]),
    },
  };
}

// ─── Helper: boot a service with the real modules dir ─────────────────────────

async function makeService(): Promise<ModuleLoaderService> {
  const mockPrisma = makePrisma();
  const svc = new ModuleLoaderService(mockPrisma as any);
  await svc.loadModules(MODULES_DIR);
  return svc;
}

// ─── Module registration tests ────────────────────────────────────────────────

describe('cribbage module — registration', () => {
  it('loads the cribbage module from the modules directory', async () => {
    const svc = await makeService();
    const mod = svc.getModule('cribbage', '1.0.0');
    expect(mod).toBeDefined();
  });

  it('has scoringType.id === numeric_rounds', async () => {
    const svc = await makeService();
    const mod = svc.getModule('cribbage', '1.0.0')!;
    expect(mod.scoringType.id).toBe('numeric_rounds');
  });

  it('has config.direction === high', async () => {
    const svc = await makeService();
    const mod = svc.getModule('cribbage', '1.0.0')!;
    const config = mod.scoringType.config as Record<string, unknown>;
    expect(config.direction).toBe('high');
  });

  it('has config.aggregate === sum', async () => {
    const svc = await makeService();
    const mod = svc.getModule('cribbage', '1.0.0')!;
    const config = mod.scoringType.config as Record<string, unknown>;
    expect(config.aggregate).toBe('sum');
  });

  it('has players.min === 2', async () => {
    const svc = await makeService();
    const mod = svc.getModule('cribbage', '1.0.0')!;
    expect(mod.players.min).toBe(2);
  });

  it('has players.max === 3', async () => {
    const svc = await makeService();
    const mod = svc.getModule('cribbage', '1.0.0')!;
    expect(mod.players.max).toBe(3);
  });

  it('has end.target === 121', async () => {
    const svc = await makeService();
    const mod = svc.getModule('cribbage', '1.0.0')!;
    expect(mod.end.target).toBe(121);
  });

  it('has end.finishRound === false', async () => {
    const svc = await makeService();
    const mod = svc.getModule('cribbage', '1.0.0')!;
    expect(mod.end.finishRound).toBe(false);
  });

  it('has a single roundScore field that is required', async () => {
    const svc = await makeService();
    const mod = svc.getModule('cribbage', '1.0.0')!;
    expect(mod.fields).toBeDefined();
    expect(mod.fields).toHaveLength(1);
    const field = mod.fields![0];
    expect(field.name).toBe('roundScore');
    expect(field.type).toBe('integer');
    expect(field.required).toBe(true);
  });

  it('appears in listModules()', async () => {
    const svc = await makeService();
    const ids = svc.listModules().map((m) => m.id);
    expect(ids).toContain('cribbage');
  });

  it('is marked released', async () => {
    const svc = await makeService();
    const mod = svc.getModule('cribbage', '1.0.0')!;
    expect((mod as Record<string, unknown>).maturity).toBe('released');
  });
});

// ─── Module maturity defaults ─────────────────────────────────────────────────

describe('module maturity — defaults', () => {
  it('cribbage is marked released', async () => {
    const svc = await makeService();
    const mod = svc.getLatestModule('cribbage')!;
    expect((mod as Record<string, unknown>).maturity).toBe('released');
  });

  it('uno has no maturity field (pre-release by default)', async () => {
    const svc = await makeService();
    const mod = svc.getLatestModule('uno')!;
    expect((mod as Record<string, unknown>).maturity).toBeUndefined();
  });

  it('all modules still pass schema validation after adding maturity', async () => {
    // If loadModules() completes without throwing, all modules validated OK
    const svc = await makeService();
    const mods = svc.listModules();
    expect(mods.length).toBeGreaterThan(0);
  });
});

// ─── numeric_rounds scoring tests (cribbage config) ──────────────────────────

describe('numeric_rounds — cribbage scoring (high/sum, 3 players)', () => {
  const config: ScoringTypeConfig = { direction: 'high', aggregate: 'sum' };

  function getNumericRounds() {
    const st = getScoringType('numeric_rounds', '1.0.0');
    if (!st) throw new Error('numeric_rounds@1.0.0 not found in registry');
    return st;
  }

  it('sums points across hands correctly for 3 players', () => {
    const st = getNumericRounds();

    // Hand 1: Alice 14, Bob 8, Carol 12
    // Hand 2: Alice 20, Bob 15, Carol 7
    // Totals: Alice 34, Bob 23, Carol 19
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'Alice', roundScore: 14, endedRound: false },
        { participationId: 'Bob', roundScore: 8, endedRound: false },
        { participationId: 'Carol', roundScore: 12, endedRound: false },
      ],
      [
        { participationId: 'Alice', roundScore: 20, endedRound: false },
        { participationId: 'Bob', roundScore: 15, endedRound: false },
        { participationId: 'Carol', roundScore: 7, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    expect(result.totals['Alice']).toBe(34);
    expect(result.totals['Bob']).toBe(23);
    expect(result.totals['Carol']).toBe(19);
  });

  it('ranks the player with the highest total first (didWin: true)', () => {
    const st = getNumericRounds();

    // Simulate a game where Bob crosses 121 first by having the highest total.
    const rounds: RoundEntry[][] = [
      [
        { participationId: 'Alice', roundScore: 35, endedRound: false },
        { participationId: 'Bob', roundScore: 50, endedRound: false },
        { participationId: 'Carol', roundScore: 20, endedRound: false },
      ],
      [
        { participationId: 'Alice', roundScore: 40, endedRound: false },
        { participationId: 'Bob', roundScore: 45, endedRound: false },
        { participationId: 'Carol', roundScore: 30, endedRound: false },
      ],
      [
        { participationId: 'Alice', roundScore: 30, endedRound: false },
        { participationId: 'Bob', roundScore: 30, endedRound: false },
        { participationId: 'Carol', roundScore: 40, endedRound: false },
      ],
    ];
    // Totals: Alice=105, Bob=125 (crossed 121), Carol=90

    const result = st.resolve(rounds, config);

    expect(result.totals['Bob']).toBe(125);
    expect(result.totals['Alice']).toBe(105);
    expect(result.totals['Carol']).toBe(90);

    const bob = result.ranks.find((r) => r.participationId === 'Bob')!;
    const alice = result.ranks.find((r) => r.participationId === 'Alice')!;
    const carol = result.ranks.find((r) => r.participationId === 'Carol')!;

    expect(bob.rank).toBe(1);
    expect(bob.didWin).toBe(true);
    expect(alice.rank).toBe(2);
    expect(alice.didWin).toBe(false);
    expect(carol.rank).toBe(3);
    expect(carol.didWin).toBe(false);
  });

  it('handles a tie (same total → same rank, both didWin)', () => {
    const st = getNumericRounds();

    const rounds: RoundEntry[][] = [
      [
        { participationId: 'P1', roundScore: 60, endedRound: false },
        { participationId: 'P2', roundScore: 60, endedRound: false },
        { participationId: 'P3', roundScore: 40, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

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

  it('totals across all players sum to the total points entered', () => {
    const st = getNumericRounds();

    const rounds: RoundEntry[][] = [
      [
        { participationId: 'A', roundScore: 12, endedRound: false },
        { participationId: 'B', roundScore: 18, endedRound: false },
        { participationId: 'C', roundScore: 9, endedRound: false },
      ],
      [
        { participationId: 'A', roundScore: 24, endedRound: false },
        { participationId: 'B', roundScore: 10, endedRound: false },
        { participationId: 'C', roundScore: 15, endedRound: false },
      ],
    ];

    const result = st.resolve(rounds, config);

    const totalAllPlayers = Object.values(result.totals).reduce((s, v) => s + v, 0);
    // Hand 1 total = 39, Hand 2 total = 49 → grand total = 88
    expect(totalAllPlayers).toBe(88);
  });
});
