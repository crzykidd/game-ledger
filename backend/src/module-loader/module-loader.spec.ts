/**
 * Module-loader unit tests.
 *
 * Validates that all game module YAML files (existing + new batch) are:
 *   1. Schema-valid (pass AJV validation against MODULE_SCHEMA).
 *   2. Reference a recognised scoring type in the code registry.
 *   3. Resolve with the correct win-direction (direction field in config).
 *
 * No DB required — tests use the filesystem loader with a fake PrismaService.
 */
import * as path from 'path';
import { ModuleLoaderService } from './module-loader.service';
import {
  getScoringType,
  getRankOrderScoringType,
  getWinnerPickScoringType,
} from '../scoring/scoring-type.registry';

// ─── Fake PrismaService (no DB needed for these tests) ───────────────────────

const fakePrisma = {
  gameModule: {
    upsert: jest.fn().mockResolvedValue({}),
  },
} as unknown as import('../prisma/prisma.service').PrismaService;

// ─── Helper: build service instance pointing at the real modules directory ────

function makeService(): ModuleLoaderService {
  return new ModuleLoaderService(fakePrisma);
}

// The modules directory relative to this test file:
// src/module-loader/ → go up 3 levels to reach game-ledger root → modules/
const MODULES_DIR = path.resolve(__dirname, '../../../modules');

// ─── Expected module inventory ────────────────────────────────────────────────

interface ModuleExpectation {
  id: string;
  name: string;
  scoringTypeId: string;
  direction: 'high' | 'low' | null; // null = rank_order (no direction in config)
}

const EXPECTED_MODULES: ModuleExpectation[] = [
  // Pre-existing
  { id: 'skyjo', name: 'Skyjo', scoringTypeId: 'numeric_rounds', direction: 'low' },
  { id: 'uno', name: 'Uno', scoringTypeId: 'numeric_rounds', direction: 'high' },
  { id: 'five-crowns', name: 'Five Crowns', scoringTypeId: 'numeric_rounds', direction: 'low' },
  { id: 'president', name: 'President', scoringTypeId: 'rank_order', direction: null },
  {
    id: 'cards-against-humanity',
    name: 'Cards Against Humanity',
    scoringTypeId: 'winner_pick',
    direction: 'high',
  },
  {
    id: 'apples-to-apples',
    name: 'Apples to Apples',
    scoringTypeId: 'winner_pick',
    direction: 'high',
  },

  // New: numeric_rounds — low-wins
  { id: 'hearts', name: 'Hearts', scoringTypeId: 'numeric_rounds', direction: 'low' },
  { id: 'phase-10', name: 'Phase 10', scoringTypeId: 'numeric_rounds', direction: 'low' },

  // New: numeric_rounds — high-wins
  { id: 'spades', name: 'Spades', scoringTypeId: 'numeric_rounds', direction: 'high' },
  { id: 'gin-rummy', name: 'Gin Rummy', scoringTypeId: 'numeric_rounds', direction: 'high' },
  { id: 'crazy-eights', name: 'Crazy Eights', scoringTypeId: 'numeric_rounds', direction: 'high' },
  { id: 'yahtzee', name: 'Yahtzee', scoringTypeId: 'numeric_rounds', direction: 'high' },

  // New: rank_order / finish-order
  { id: '3up3dn', name: '3UP 3DOWN', scoringTypeId: 'rank_order', direction: null },
  { id: 'big-two', name: 'Big Two', scoringTypeId: 'rank_order', direction: null },
  {
    id: 'exploding-kittens',
    name: 'Exploding Kittens',
    scoringTypeId: 'rank_order',
    direction: null,
  },
  { id: 'coup', name: 'Coup', scoringTypeId: 'rank_order', direction: null },
  { id: 'liars-dice', name: "Liar's Dice", scoringTypeId: 'rank_order', direction: null },

  // New: numeric_rounds — high-wins, race-to-target
  { id: 'cribbage', name: 'Cribbage', scoringTypeId: 'numeric_rounds', direction: 'high' },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ModuleLoaderService — all modules load correctly', () => {
  let service: ModuleLoaderService;

  beforeAll(async () => {
    service = makeService();
    await service.loadModules(MODULES_DIR);
  });

  it('loads all expected modules (no missing entries)', () => {
    const loaded = service.listModules();
    const loadedIds = loaded.map((m) => m.id);

    for (const expected of EXPECTED_MODULES) {
      expect(loadedIds).toContain(expected.id);
    }
  });

  it(`loads exactly ${EXPECTED_MODULES.length} modules (no phantom extras)`, () => {
    const loaded = service.listModules();
    expect(loaded).toHaveLength(EXPECTED_MODULES.length);
  });

  for (const expected of EXPECTED_MODULES) {
    describe(`module: ${expected.id}`, () => {
      it('registers in the in-memory registry', () => {
        const mod = service.getLatestModule(expected.id);
        expect(mod).toBeDefined();
        expect(mod!.name).toBe(expected.name);
      });

      it('references a known scoring type', () => {
        const mod = service.getLatestModule(expected.id)!;
        const { id: stId, version: stVer } = mod.scoringType;

        const found =
          getScoringType(stId, stVer) ??
          getRankOrderScoringType(stId, stVer) ??
          getWinnerPickScoringType(stId, stVer);

        expect(found).toBeDefined();
        expect(found!.id).toBe(expected.scoringTypeId);
      });

      if (expected.direction !== null) {
        it(`has direction = "${expected.direction}"`, () => {
          const mod = service.getLatestModule(expected.id)!;
          expect(mod.scoringType.config).toBeDefined();
          expect((mod.scoringType.config as Record<string, unknown>).direction).toBe(
            expected.direction,
          );
        });
      }
    });
  }
});

// ─── Scoring-type resolution sanity checks for new modules ───────────────────

describe('New numeric_rounds modules — scoring type resolves correctly', () => {
  it('hearts resolves with direction=low (fewest points wins)', () => {
    const st = getScoringType('numeric_rounds', '1.0.0')!;
    const config = { direction: 'low' as const, aggregate: 'sum' as const };

    const result = st.resolve(
      [
        [
          { participationId: 'Alice', roundScore: 5, endedRound: false },
          { participationId: 'Bob', roundScore: 15, endedRound: false },
        ],
      ],
      config,
    );

    // Low wins — Alice (5) should be rank 1
    const alice = result.ranks.find((r) => r.participationId === 'Alice')!;
    const bob = result.ranks.find((r) => r.participationId === 'Bob')!;
    expect(alice.rank).toBe(1);
    expect(alice.didWin).toBe(true);
    expect(bob.rank).toBe(2);
    expect(bob.didWin).toBe(false);
  });

  it('spades resolves with direction=high (most points wins)', () => {
    const st = getScoringType('numeric_rounds', '1.0.0')!;
    const config = { direction: 'high' as const, aggregate: 'sum' as const };

    const result = st.resolve(
      [
        [
          { participationId: 'Alice', roundScore: 200, endedRound: false },
          { participationId: 'Bob', roundScore: 350, endedRound: false },
        ],
        [
          { participationId: 'Alice', roundScore: 160, endedRound: false },
          { participationId: 'Bob', roundScore: 80, endedRound: false },
        ],
      ],
      config,
    );

    // After 2 rounds: Alice=360, Bob=430 — Bob wins (high)
    const alice = result.ranks.find((r) => r.participationId === 'Alice')!;
    const bob = result.ranks.find((r) => r.participationId === 'Bob')!;
    expect(bob.rank).toBe(1);
    expect(bob.didWin).toBe(true);
    expect(alice.rank).toBe(2);
    expect(alice.didWin).toBe(false);
  });

  it('yahtzee uses aggregate=last (final total entered once)', () => {
    const st = getScoringType('numeric_rounds', '1.0.0')!;
    const config = { direction: 'high' as const, aggregate: 'last' as const };

    // Yahtzee is fixed_rounds=1 — only one "round" = the final total
    const result = st.resolve(
      [
        [
          { participationId: 'Alice', roundScore: 312, endedRound: false },
          { participationId: 'Bob', roundScore: 248, endedRound: false },
        ],
      ],
      config,
    );

    // High wins — Alice (312) is rank 1
    const alice = result.ranks.find((r) => r.participationId === 'Alice')!;
    expect(alice.rank).toBe(1);
    expect(alice.didWin).toBe(true);
    expect(alice.score).toBe(312);
  });
});

describe('New rank_order modules — finish-order resolution', () => {
  it('3up3dn: first finisher is rank 1, last is last rank', () => {
    const st = getRankOrderScoringType('rank_order', '1.0.0')!;
    const config = { direction: 'high' as const, aggregate: 'sum' as const };

    const result = st.resolveFinishOrder(
      [
        { participationId: 'Alice', rank: 1 },
        { participationId: 'Bob', rank: 2 },
        { participationId: 'Carol', rank: 3 },
      ],
      config,
    );

    const alice = result.ranks.find((r) => r.participationId === 'Alice')!;
    const carol = result.ranks.find((r) => r.participationId === 'Carol')!;
    expect(alice.rank).toBe(1);
    expect(alice.didWin).toBe(true);
    expect(carol.rank).toBe(3);
    expect(carol.didWin).toBe(false);
  });

  it('exploding-kittens: last survivor is rank 1', () => {
    const st = getRankOrderScoringType('rank_order', '1.0.0')!;
    const config = { direction: 'high' as const, aggregate: 'sum' as const };

    const result = st.resolveFinishOrder(
      [
        { participationId: 'Survivor', rank: 1 },
        { participationId: 'SecondOut', rank: 2 },
        { participationId: 'FirstElim', rank: 3 },
      ],
      config,
    );

    const survivor = result.ranks.find((r) => r.participationId === 'Survivor')!;
    const firstElim = result.ranks.find((r) => r.participationId === 'FirstElim')!;
    expect(survivor.rank).toBe(1);
    expect(survivor.didWin).toBe(true);
    expect(firstElim.rank).toBe(3);
  });
});
