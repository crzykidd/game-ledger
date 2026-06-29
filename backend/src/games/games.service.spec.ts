/**
 * GamesService integration tests.
 * Requires DATABASE_URL pointing to a running Postgres with migrations applied.
 *
 * Each test cleans up its own data (isolation-safe).
 */
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { GamesService } from './games.service';
import { ModuleLoaderService } from '../module-loader/module-loader.service';
import { PasswordService } from '../auth/password.service';

const prisma = new PrismaClient();

function makeModuleLoader() {
  return new ModuleLoaderService(prisma as any);
}

function makeService(loader: ModuleLoaderService) {
  return new GamesService(prisma as any, loader);
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function createUser() {
  const passwordSvc = new PasswordService();
  return prisma.user.create({
    data: {
      email: `game-${uid()}@test.com`,
      passwordHash: await passwordSvc.hash('Test1234!@'),
      fullName: 'Test User',
      nickname: `tuser-${uid()}`,
      role: 'PLAYER',
      state: 'ACTIVE',
    },
  });
}

async function createPlayer(userId: string, createdById: string) {
  return prisma.player.create({
    data: { nickname: `player-${uid()}`, userId, createdById },
  });
}

async function createGuestPlayer(createdById: string, nickname?: string) {
  return prisma.player.create({
    data: { nickname: nickname ?? `guest-${uid()}`, createdById },
  });
}

afterAll(() => prisma.$disconnect());

// ─── Module loader tests ─────────────────────────────────────────────────────

describe('ModuleLoaderService — YAML loading and validation', () => {
  it('loads and validates the Skyjo YAML module', async () => {
    const loader = makeModuleLoader();
    const modulesDir = path.resolve(__dirname, '../../../modules');

    await loader.loadModules(modulesDir);

    const skyjo = loader.getModule('skyjo', '1.0.0');
    expect(skyjo).toBeDefined();
    expect(skyjo!.id).toBe('skyjo');
    expect(skyjo!.name).toBe('Skyjo');
    expect(skyjo!.players.min).toBe(2);
    expect(skyjo!.players.max).toBe(8);
    expect(skyjo!.scoringType.id).toBe('numeric_rounds');
    expect(skyjo!.end.type).toBe('target');
    expect(skyjo!.end.target).toBe(100);

    // Clean up DB record
    await prisma.gameModule.deleteMany({
      where: { moduleKey: { in: ['skyjo', 'uno', 'five-crowns'] } },
    });
  });

  it('rejects an invalid module YAML (missing required fields)', async () => {
    const loader = makeModuleLoader();

    const fsModule = await import('fs');
    const osModule = await import('os');
    const tmpDir = fsModule.mkdtempSync(path.join(osModule.tmpdir(), 'game-ledger-test-'));
    const yamlPath = path.join(tmpDir, 'module.yaml');

    // Write an invalid module (missing required 'players', 'scoringType', etc.)
    fsModule.writeFileSync(yamlPath, 'id: test-invalid\nname: Test\nversion: "1.0.0"\n');

    await expect(loader.loadOneModule(yamlPath)).rejects.toThrow(/invalid module yaml/i);

    // Clean up temp dir
    fsModule.rmSync(tmpDir, { recursive: true });
  });
});

// ─── Game lifecycle tests ─────────────────────────────────────────────────────

describe('GamesService — game lifecycle', () => {
  let loader: ModuleLoaderService;

  beforeAll(async () => {
    loader = makeModuleLoader();
    const modulesDir = path.resolve(__dirname, '../../../modules');
    await loader.loadModules(modulesDir);
  });

  afterAll(async () => {
    await prisma.gameModule.deleteMany({
      where: { moduleKey: { in: ['skyjo', 'uno', 'five-crowns'] } },
    });
  });

  it('creates a game with valid player count', async () => {
    const svc = makeService(loader);
    const user1 = await createUser();
    const user2 = await createUser();
    const p1 = await createPlayer(user1.id, user1.id);
    const p2 = await createPlayer(user2.id, user1.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      user1.id,
    );

    expect(game.moduleKey).toBe('skyjo');
    expect(game.status).toBe('ACTIVE');
    expect(game.participations).toHaveLength(2);

    // Cleanup
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id] } } });
  });

  it('rejects game creation with too few players', async () => {
    const svc = makeService(loader);
    const user = await createUser();
    const p1 = await createPlayer(user.id, user.id);

    await expect(
      svc.createGame({ moduleKey: 'skyjo', participantPlayerIds: [p1.id] }, user.id),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Cleanup
    await prisma.player.delete({ where: { id: p1.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects game creation with too many players', async () => {
    const svc = makeService(loader);
    const user = await createUser();
    const players = await Promise.all(Array.from({ length: 9 }, () => createGuestPlayer(user.id)));
    const playerIds = players.map((p) => p.id);

    await expect(
      svc.createGame({ moduleKey: 'skyjo', participantPlayerIds: playerIds }, user.id),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Cleanup
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('finishes a game and computes correct winner/ranks (low-wins)', async () => {
    const svc = makeService(loader);
    const user1 = await createUser();
    const user2 = await createUser();
    const p1 = await createPlayer(user1.id, user1.id);
    const p2 = await createPlayer(user2.id, user1.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      user1.id,
    );

    const parts = game.participations as Array<{ id: string; playerId: string }>;
    const part1 = parts.find((pp) => pp.playerId === p1.id)!;
    const part2 = parts.find((pp) => pp.playerId === p2.id)!;

    // Post a round: P1=5 (strictly lowest, ender), P2=20
    await svc.postEvent(
      game.id,
      {
        clientEventId: `${uid()}-ce1`,
        baseVersion: 0,
        type: 'round_score',
        payload: {
          round: 1,
          scores: [
            { participationId: part1.id, roundScore: 5, endedRound: true },
            { participationId: part2.id, roundScore: 20, endedRound: false },
          ],
        },
      },
      user1.id,
    );

    const { resolved } = await svc.finishGame(game.id, user1.id);

    // P1 has 5, P2 has 20 (no doubling since P1 ended and was strictly lowest)
    const r1 = resolved.ranks.find((r) => r.participationId === part1.id)!;
    const r2 = resolved.ranks.find((r) => r.participationId === part2.id)!;

    expect(r1.rank).toBe(1);
    expect(r1.didWin).toBe(true);
    expect(r2.rank).toBe(2);
    expect(r2.didWin).toBe(false);

    // Check game status
    const finishedGame = await prisma.game.findUnique({ where: { id: game.id } });
    expect(finishedGame!.status).toBe('COMPLETE');
    expect(finishedGame!.endedAt).not.toBeNull();

    // Cleanup
    await prisma.gameResult.deleteMany({ where: { gameId: game.id } });
    await prisma.scoreState.deleteMany({ where: { gameId: game.id } });
    await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id] } } });
  });
});

// ─── Scorekeeper enforcement ─────────────────────────────────────────────────

describe('GamesService — scorekeeper enforcement', () => {
  let loader: ModuleLoaderService;

  beforeAll(async () => {
    loader = makeModuleLoader();
    const modulesDir = path.resolve(__dirname, '../../../modules');
    await loader.loadModules(modulesDir);
  });

  afterAll(async () => {
    await prisma.gameModule.deleteMany({
      where: { moduleKey: { in: ['skyjo', 'uno', 'five-crowns'] } },
    });
  });

  it('rejects event write from non-scorekeeper', async () => {
    const svc = makeService(loader);
    const creator = await createUser();
    const other = await createUser();
    const p1 = await createGuestPlayer(creator.id);
    const p2 = await createGuestPlayer(creator.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      creator.id,
    );

    await expect(
      svc.postEvent(
        game.id,
        {
          clientEventId: `${uid()}-ce-nsk`,
          baseVersion: 0,
          type: 'round_score',
          payload: { round: 1, scores: [] },
        },
        other.id, // not the scorekeeper
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Cleanup
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [creator.id, other.id] } } });
  });

  it('rejects finish from non-scorekeeper', async () => {
    const svc = makeService(loader);
    const creator = await createUser();
    const other = await createUser();
    const p1 = await createGuestPlayer(creator.id);
    const p2 = await createGuestPlayer(creator.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      creator.id,
    );

    await expect(svc.finishGame(game.id, other.id)).rejects.toBeInstanceOf(ForbiddenException);

    // Cleanup
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [creator.id, other.id] } } });
  });
});

// ─── Event idempotency ───────────────────────────────────────────────────────

describe('GamesService — event idempotency', () => {
  let loader: ModuleLoaderService;

  beforeAll(async () => {
    loader = makeModuleLoader();
    const modulesDir = path.resolve(__dirname, '../../../modules');
    await loader.loadModules(modulesDir);
  });

  afterAll(async () => {
    await prisma.gameModule.deleteMany({
      where: { moduleKey: { in: ['skyjo', 'uno', 'five-crowns'] } },
    });
  });

  it('re-posting the same clientEventId does not double-apply', async () => {
    const svc = makeService(loader);
    const user = await createUser();
    const p1 = await createGuestPlayer(user.id, 'IdempA');
    const p2 = await createGuestPlayer(user.id, 'IdempB');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      user.id,
    );

    const parts = game.participations as Array<{ id: string; playerId: string }>;
    const part1 = parts.find((pp) => pp.playerId === p1.id)!;
    const part2 = parts.find((pp) => pp.playerId === p2.id)!;

    const clientEventId = `${uid()}-idem`;
    const eventPayload = {
      clientEventId,
      baseVersion: 0,
      type: 'round_score',
      payload: {
        round: 1,
        scores: [
          { participationId: part1.id, roundScore: 10, endedRound: false },
          { participationId: part2.id, roundScore: 5, endedRound: true },
        ],
      },
    };

    // First post — should succeed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first: any = await svc.postEvent(game.id, eventPayload, user.id);
    expect(first.version).toBe(1);

    // Re-post same clientEventId — should return idempotent result, NOT double-apply
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const second: any = await svc.postEvent(game.id, { ...eventPayload, baseVersion: 1 }, user.id);
    expect(second.idempotent).toBe(true);

    // Only one event should exist
    const events = await prisma.gameEvent.findMany({ where: { gameId: game.id } });
    expect(events).toHaveLength(1);

    // Cleanup
    await prisma.scoreState.deleteMany({ where: { gameId: game.id } });
    await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

// ─── Optimistic concurrency ──────────────────────────────────────────────────

describe('GamesService — optimistic concurrency (baseVersion)', () => {
  let loader: ModuleLoaderService;

  beforeAll(async () => {
    loader = makeModuleLoader();
    const modulesDir = path.resolve(__dirname, '../../../modules');
    await loader.loadModules(modulesDir);
  });

  afterAll(async () => {
    await prisma.gameModule.deleteMany({
      where: { moduleKey: { in: ['skyjo', 'uno', 'five-crowns'] } },
    });
  });

  it('rejects event with stale baseVersion and returns current state', async () => {
    const svc = makeService(loader);
    const user = await createUser();
    const p1 = await createGuestPlayer(user.id, 'ConcA');
    const p2 = await createGuestPlayer(user.id, 'ConcB');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      user.id,
    );

    const parts = game.participations as Array<{ id: string; playerId: string }>;
    const part1 = parts.find((pp) => pp.playerId === p1.id)!;
    const part2 = parts.find((pp) => pp.playerId === p2.id)!;

    // Write event at version 0 => bumps to version 1
    await svc.postEvent(
      game.id,
      {
        clientEventId: `${uid()}-conc1`,
        baseVersion: 0,
        type: 'round_score',
        payload: {
          round: 1,
          scores: [
            { participationId: part1.id, roundScore: 7, endedRound: false },
            { participationId: part2.id, roundScore: 3, endedRound: true },
          ],
        },
      },
      user.id,
    );

    // Try to write at version 0 again => stale => should throw ConflictException
    await expect(
      svc.postEvent(
        game.id,
        {
          clientEventId: `${uid()}-conc2`,
          baseVersion: 0, // stale — current is 1
          type: 'round_score',
          payload: {
            round: 2,
            scores: [
              { participationId: part1.id, roundScore: 4, endedRound: false },
              { participationId: part2.id, roundScore: 9, endedRound: true },
            ],
          },
        },
        user.id,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    // Cleanup
    await prisma.scoreState.deleteMany({ where: { gameId: game.id } });
    await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

// ─── Uno high-wins ranking ───────────────────────────────────────────────────

describe('GamesService — Uno high-wins ranking', () => {
  let loader: ModuleLoaderService;

  beforeAll(async () => {
    loader = makeModuleLoader();
    const modulesDir = path.resolve(__dirname, '../../../modules');
    await loader.loadModules(modulesDir);
  });

  afterAll(async () => {
    await prisma.gameModule.deleteMany({
      where: { moduleKey: { in: ['skyjo', 'uno', 'five-crowns'] } },
    });
  });

  it('finishes an Uno game and ranks highest scorer first (high-wins)', async () => {
    const svc = makeService(loader);
    const user1 = await createUser();
    const user2 = await createUser();
    const p1 = await createPlayer(user1.id, user1.id);
    const p2 = await createPlayer(user2.id, user1.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'uno', participantPlayerIds: [p1.id, p2.id] },
      user1.id,
    );

    const parts = game.participations as Array<{ id: string; playerId: string }>;
    const part1 = parts.find((pp) => pp.playerId === p1.id)!;
    const part2 = parts.find((pp) => pp.playerId === p2.id)!;

    // Post one round: P1 wins with 200 points, P2 scores 50
    await svc.postEvent(
      game.id,
      {
        clientEventId: `${uid()}-uno-r1`,
        baseVersion: 0,
        type: 'round_score',
        payload: {
          round: 1,
          scores: [
            { participationId: part1.id, roundScore: 200, endedRound: false },
            { participationId: part2.id, roundScore: 50, endedRound: false },
          ],
        },
      },
      user1.id,
    );

    const { resolved } = await svc.finishGame(game.id, user1.id);

    // P1 has 200, P2 has 50 — high wins → rank 1 = P1
    const r1 = resolved.ranks.find((r) => r.participationId === part1.id)!;
    const r2 = resolved.ranks.find((r) => r.participationId === part2.id)!;

    expect(r1.rank).toBe(1);
    expect(r1.didWin).toBe(true);
    expect(r1.score).toBe(200);
    expect(r2.rank).toBe(2);
    expect(r2.didWin).toBe(false);

    // Cleanup
    await prisma.gameResult.deleteMany({ where: { gameId: game.id } });
    await prisma.scoreState.deleteMany({ where: { gameId: game.id } });
    await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id] } } });
  });
});

// ─── Five Crowns fixed_rounds low-wins ranking ───────────────────────────────

describe('GamesService — Five Crowns fixed_rounds low-wins ranking', () => {
  let loader: ModuleLoaderService;

  beforeAll(async () => {
    loader = makeModuleLoader();
    const modulesDir = path.resolve(__dirname, '../../../modules');
    await loader.loadModules(modulesDir);
  });

  afterAll(async () => {
    await prisma.gameModule.deleteMany({
      where: { moduleKey: { in: ['skyjo', 'uno', 'five-crowns'] } },
    });
  });

  it('finishes a Five Crowns game (11 rounds) and ranks lowest scorer first', async () => {
    const svc = makeService(loader);
    const user1 = await createUser();
    const user2 = await createUser();
    const p1 = await createPlayer(user1.id, user1.id);
    const p2 = await createPlayer(user2.id, user1.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'five-crowns', participantPlayerIds: [p1.id, p2.id] },
      user1.id,
    );

    const parts = game.participations as Array<{ id: string; playerId: string }>;
    const part1 = parts.find((pp) => pp.playerId === p1.id)!;
    const part2 = parts.find((pp) => pp.playerId === p2.id)!;

    // Post 11 rounds: P1 consistently low penalty (3), P2 high penalty (25)
    let version = 0;
    for (let round = 1; round <= 11; round++) {
      await svc.postEvent(
        game.id,
        {
          clientEventId: `${uid()}-fc-r${round}`,
          baseVersion: version,
          type: 'round_score',
          payload: {
            round,
            scores: [
              { participationId: part1.id, roundScore: 3, endedRound: false },
              { participationId: part2.id, roundScore: 25, endedRound: false },
            ],
          },
        },
        user1.id,
      );
      version += 1;
    }

    const { resolved } = await svc.finishGame(game.id, user1.id);

    // P1: 33 total, P2: 275 total — low wins → rank 1 = P1
    const r1 = resolved.ranks.find((r) => r.participationId === part1.id)!;
    const r2 = resolved.ranks.find((r) => r.participationId === part2.id)!;

    expect(r1.rank).toBe(1);
    expect(r1.didWin).toBe(true);
    expect(r1.score).toBe(33);
    expect(r2.rank).toBe(2);
    expect(r2.didWin).toBe(false);
    expect(r2.score).toBe(275);

    // Cleanup
    await prisma.gameResult.deleteMany({ where: { gameId: game.id } });
    await prisma.scoreState.deleteMany({ where: { gameId: game.id } });
    await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id] } } });
  });
});

// ─── Cancel game ────────────────────────────────────────────────────────────────

describe('GamesService — cancelGame', () => {
  let loader: ModuleLoaderService;

  beforeAll(async () => {
    loader = makeModuleLoader();
    const modulesDir = path.resolve(__dirname, '../../../modules');
    await loader.loadModules(modulesDir);
  });

  afterAll(async () => {
    await prisma.gameModule.deleteMany({
      where: { moduleKey: { in: ['skyjo', 'uno', 'five-crowns'] } },
    });
  });

  it('sets status ABANDONED + endedAt for the creator', async () => {
    const svc = makeService(loader);
    const creator = await createUser();
    const p1 = await createGuestPlayer(creator.id);
    const p2 = await createGuestPlayer(creator.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      creator.id,
    );

    expect(game.status).toBe('ACTIVE');

    const cancelled = await svc.cancelGame(game.id, creator.id);
    expect(cancelled.status).toBe('ABANDONED');
    expect(cancelled.endedAt).not.toBeNull();

    // Cleanup
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.delete({ where: { id: creator.id } });
  });

  it('403s for a non-creator', async () => {
    const svc = makeService(loader);
    const creator = await createUser();
    const other = await createUser();
    const p1 = await createGuestPlayer(creator.id);
    const p2 = await createGuestPlayer(creator.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      creator.id,
    );

    await expect(svc.cancelGame(game.id, other.id)).rejects.toBeInstanceOf(ForbiddenException);

    // Cleanup
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [creator.id, other.id] } } });
  });
});

// ─── Delete game ────────────────────────────────────────────────────────────────

describe('GamesService — deleteGame', () => {
  let loader: ModuleLoaderService;

  beforeAll(async () => {
    loader = makeModuleLoader();
    const modulesDir = path.resolve(__dirname, '../../../modules');
    await loader.loadModules(modulesDir);
  });

  afterAll(async () => {
    await prisma.gameModule.deleteMany({
      where: { moduleKey: { in: ['skyjo', 'uno', 'five-crowns'] } },
    });
  });

  it('hard-deletes the game + children for the creator', async () => {
    const svc = makeService(loader);
    const creator = await createUser();
    const p1 = await createGuestPlayer(creator.id);
    const p2 = await createGuestPlayer(creator.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      creator.id,
    );

    // Post an event so we have game_events and score_states
    const parts = game.participations as Array<{ id: string; playerId: string }>;
    await svc.postEvent(
      game.id,
      {
        clientEventId: `${uid()}-del-ev`,
        baseVersion: 0,
        type: 'round_score',
        payload: {
          round: 1,
          scores: [
            { participationId: parts[0].id, roundScore: 5, endedRound: false },
            { participationId: parts[1].id, roundScore: 8, endedRound: false },
          ],
        },
      },
      creator.id,
    );

    const result = await svc.deleteGame(game.id, creator.id);
    expect(result).toEqual({ deleted: true });

    // Game should be gone
    const gone = await prisma.game.findUnique({ where: { id: game.id } });
    expect(gone).toBeNull();

    // Children should also be gone
    const events = await prisma.gameEvent.findMany({ where: { gameId: game.id } });
    expect(events).toHaveLength(0);
    const states = await prisma.scoreState.findMany({ where: { gameId: game.id } });
    expect(states).toHaveLength(0);

    // Cleanup players + user
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.delete({ where: { id: creator.id } });
  });

  it('403s for a non-creator', async () => {
    const svc = makeService(loader);
    const creator = await createUser();
    const other = await createUser();
    const p1 = await createGuestPlayer(creator.id);
    const p2 = await createGuestPlayer(creator.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      creator.id,
    );

    await expect(svc.deleteGame(game.id, other.id)).rejects.toBeInstanceOf(ForbiddenException);

    // Cleanup
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [creator.id, other.id] } } });
  });
});

// ─── Undo last round ─────────────────────────────────────────────────────────

describe('GamesService — undoLastRound', () => {
  let loader: ModuleLoaderService;

  beforeAll(async () => {
    loader = makeModuleLoader();
    const modulesDir = path.resolve(__dirname, '../../../modules');
    await loader.loadModules(modulesDir);
  });

  afterAll(async () => {
    await prisma.gameModule.deleteMany({
      where: { moduleKey: { in: ['skyjo', 'uno', 'five-crowns'] } },
    });
  });

  it('undoes the last round: reverts state and decrements round count', async () => {
    const svc = makeService(loader);
    const user = await createUser();
    const p1 = await createGuestPlayer(user.id, 'UndoA');
    const p2 = await createGuestPlayer(user.id, 'UndoB');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      user.id,
    );
    const parts = game.participations as Array<{ id: string; playerId: string }>;
    const part1 = parts.find((pp) => pp.playerId === p1.id)!;
    const part2 = parts.find((pp) => pp.playerId === p2.id)!;

    // Post round 1
    await svc.postEvent(
      game.id,
      {
        clientEventId: `${uid()}-ur1`,
        baseVersion: 0,
        type: 'round_score',
        payload: {
          round: 1,
          scores: [
            { participationId: part1.id, roundScore: 10, endedRound: false },
            { participationId: part2.id, roundScore: 5, endedRound: true },
          ],
        },
      },
      user.id,
    );

    // Post round 2
    await svc.postEvent(
      game.id,
      {
        clientEventId: `${uid()}-ur2`,
        baseVersion: 1,
        type: 'round_score',
        payload: {
          round: 2,
          scores: [
            { participationId: part1.id, roundScore: 8, endedRound: false },
            { participationId: part2.id, roundScore: 12, endedRound: false },
          ],
        },
      },
      user.id,
    );

    // Verify totals before undo: P1=18, P2=17
    const statesBefore = await prisma.scoreState.findMany({ where: { gameId: game.id } });
    const p1StateBefore = statesBefore.find((s) => s.participationId === part1.id)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((p1StateBefore.payload as any).totals[part1.id]).toBe(18);

    // Undo last round
    const result = await svc.undoLastRound(game.id, user.id);
    expect(result.undone).toBe(true);

    // Version should be 1 (one event remains)
    expect(result.version).toBe(1);

    // State should revert to after round 1: P1=10, P2=5
    const p1State = result.scoreStates.find((s) => s.participationId === part1.id)!;
    const p2State = result.scoreStates.find((s) => s.participationId === part2.id)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((p1State.payload as any).totals[part1.id]).toBe(10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((p2State.payload as any).totals[part2.id]).toBe(5);

    // Only 1 event remains
    const events = await prisma.gameEvent.findMany({ where: { gameId: game.id } });
    expect(events).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((events[0].payload as any).round).toBe(1);

    // Cleanup
    await prisma.scoreState.deleteMany({ where: { gameId: game.id } });
    await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('403s for a non-creator trying to undo', async () => {
    const svc = makeService(loader);
    const creator = await createUser();
    const other = await createUser();
    const p1 = await createGuestPlayer(creator.id);
    const p2 = await createGuestPlayer(creator.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      creator.id,
    );

    await expect(svc.undoLastRound(game.id, other.id)).rejects.toBeInstanceOf(ForbiddenException);

    // Cleanup
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [creator.id, other.id] } } });
  });

  it('safe no-op when there are no rounds yet', async () => {
    const svc = makeService(loader);
    const user = await createUser();
    const p1 = await createGuestPlayer(user.id);
    const p2 = await createGuestPlayer(user.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game: any = await svc.createGame(
      { moduleKey: 'skyjo', participantPlayerIds: [p1.id, p2.id] },
      user.id,
    );

    const result = await svc.undoLastRound(game.id, user.id);
    expect(result.undone).toBe(false);
    expect(result.reason).toBe('no_rounds');
    expect(result.version).toBe(0);

    // Cleanup
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id] } } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
