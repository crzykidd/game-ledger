/**
 * Round-trip test for the M1 Prisma schema.
 *
 * Requires DATABASE_URL to point to a running Postgres with the migrations
 * applied (docker-compose.dev.yml db service). Verifies:
 *   - Prisma client can connect and perform CRUD on representative models.
 *   - FK relations resolve correctly.
 *   - Enum values are accepted.
 *   - append-only GameEvent (gameId, seq) unique constraint works.
 *
 * Note: each test cleans up after itself using the same client; if a test
 * fails mid-way the next run may see leftover rows — acceptable for local dev.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper: unique-enough suffix for parallel runs / re-runs
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

afterAll(async () => {
  await prisma.$disconnect();
});

describe('M1 schema round-trip', () => {
  // ── User + Session ─────────────────────────────────────────────────────────

  it('creates a User and reads it back with correct defaults', async () => {
    const email = `test-${uid()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'hashed',
        fullName: 'Alice Test',
        nickname: 'alice',
      },
    });

    expect(user.id).toBeDefined();
    expect(user.role).toBe('PLAYER');
    expect(user.state).toBe('PENDING');
    expect(user.themePref).toBe('SYSTEM');
    expect(user.email).toBe(email);

    // Session tied to user
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: `test-hash-${uid()}`,
        expiresAt: new Date(Date.now() + 86_400_000),
        userAgent: 'test-ua',
      },
    });
    expect(session.userId).toBe(user.id);
    expect(session.revokedAt).toBeNull();

    // cleanup
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  // ── Token (invite) ─────────────────────────────────────────────────────────

  it('creates an INVITE token and enforces tokenHash uniqueness', async () => {
    const email = `creator-${uid()}@example.com`;
    const creator = await prisma.user.create({
      data: {
        email,
        passwordHash: 'hashed',
        fullName: 'Bob Creator',
        nickname: 'bob',
        role: 'ADMIN',
        state: 'ACTIVE',
      },
    });

    const tokenHash = `hash-${uid()}`;
    const token = await prisma.token.create({
      data: {
        type: 'INVITE',
        tokenHash,
        targetEmail: 'invitee@example.com',
        createdById: creator.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    expect(token.status).toBe('PENDING');
    expect(token.consumedAt).toBeNull();

    // Duplicate hash should fail
    await expect(
      prisma.token.create({
        data: {
          type: 'INVITE',
          tokenHash, // same hash
          createdById: creator.id,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    ).rejects.toThrow();

    // cleanup
    await prisma.token.delete({ where: { id: token.id } });
    await prisma.user.delete({ where: { id: creator.id } });
  });

  // ── Player + Playgroup ─────────────────────────────────────────────────────

  it('creates a User → Player (linked) and a guest Player (unlinked)', async () => {
    const email = `owner-${uid()}@example.com`;
    const owner = await prisma.user.create({
      data: {
        email,
        passwordHash: 'hashed',
        fullName: 'Owner User',
        nickname: 'owner',
        state: 'ACTIVE',
      },
    });

    const linkedPlayer = await prisma.player.create({
      data: {
        nickname: 'owner',
        userId: owner.id,
        createdById: owner.id,
      },
    });

    const guestPlayer = await prisma.player.create({
      data: {
        nickname: 'GuestFred',
        createdById: owner.id,
        // userId omitted → guest
      },
    });

    expect(linkedPlayer.userId).toBe(owner.id);
    expect(guestPlayer.userId).toBeNull();

    // Playgroup
    const pg = await prisma.playgroup.create({
      data: { name: `TestGroup-${uid()}`, createdById: owner.id },
    });

    // Add both players to playgroup
    await prisma.playgroupMember.createMany({
      data: [
        { playgroupId: pg.id, playerId: linkedPlayer.id },
        { playgroupId: pg.id, playerId: guestPlayer.id },
      ],
    });

    const memberCount = await prisma.playgroupMember.count({
      where: { playgroupId: pg.id },
    });
    expect(memberCount).toBe(2);

    // cleanup (order matters for FKs)
    await prisma.playgroupMember.deleteMany({ where: { playgroupId: pg.id } });
    await prisma.playgroup.delete({ where: { id: pg.id } });
    await prisma.player.delete({ where: { id: guestPlayer.id } });
    await prisma.player.delete({ where: { id: linkedPlayer.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });

  // ── Full game flow: Game → Participation → GameEvent → ScoreState → GameResult ─

  it('exercises the full game flow with representative models', async () => {
    const email = `game-owner-${uid()}@example.com`;
    const owner = await prisma.user.create({
      data: {
        email,
        passwordHash: 'hashed',
        fullName: 'Game Owner',
        nickname: `go-${uid()}`,
        state: 'ACTIVE',
      },
    });

    const playerA = await prisma.player.create({
      data: { nickname: `PA-${uid()}`, createdById: owner.id },
    });
    const playerB = await prisma.player.create({
      data: { nickname: `PB-${uid()}`, createdById: owner.id },
    });

    const game = await prisma.game.create({
      data: {
        moduleKey: 'skyjo',
        moduleVersion: '1.0.0',
        scoringTypeId: 'numeric_rounds',
        scoringTypeVersion: '1.0.0',
        createdById: owner.id,
        status: 'ACTIVE',
      },
    });

    const partA = await prisma.participation.create({
      data: { gameId: game.id, playerId: playerA.id, seat: 0 },
    });
    const partB = await prisma.participation.create({
      data: { gameId: game.id, playerId: playerB.id, seat: 1 },
    });

    // Append two events with sequential (gameId, seq)
    const evt1 = await prisma.gameEvent.create({
      data: {
        gameId: game.id,
        seq: 1,
        authorPlayerId: playerA.id,
        type: 'ROUND_SCORE',
        payload: { roundScore: 10, endedRound: false },
        clientEventId: `ce-${uid()}`,
      },
    });
    const evt2 = await prisma.gameEvent.create({
      data: {
        gameId: game.id,
        seq: 2,
        authorPlayerId: playerB.id,
        type: 'ROUND_SCORE',
        payload: { roundScore: 15, endedRound: true },
        clientEventId: `ce-${uid()}`,
      },
    });

    // Duplicate (gameId, seq) should fail
    await expect(
      prisma.gameEvent.create({
        data: {
          gameId: game.id,
          seq: 1, // duplicate seq
          type: 'ROUND_SCORE',
          payload: {},
          clientEventId: `ce-${uid()}`,
        },
      }),
    ).rejects.toThrow();

    // Upsert materialized score state
    await prisma.scoreState.create({
      data: {
        gameId: game.id,
        participationId: partA.id,
        payload: { total: 10 },
      },
    });

    // Write game results
    await prisma.gameResult.create({
      data: {
        gameId: game.id,
        participationId: partA.id,
        rank: 1,
        didWin: true,
        score: 10,
      },
    });
    await prisma.gameResult.create({
      data: {
        gameId: game.id,
        participationId: partB.id,
        rank: 2,
        didWin: false,
        score: 15,
      },
    });

    // Verify relations load
    const fullGame = await prisma.game.findUniqueOrThrow({
      where: { id: game.id },
      include: {
        participations: { include: { player: true, result: true } },
        events: true,
        scoreStates: true,
      },
    });

    expect(fullGame.participations).toHaveLength(2);
    expect(fullGame.events).toHaveLength(2);
    expect(fullGame.scoreStates).toHaveLength(1);
    expect(fullGame.participations[0].result).not.toBeNull();

    const winner = fullGame.participations.find((p) => p.result?.didWin);
    expect(winner?.player.nickname).toBe(playerA.nickname);

    // cleanup (reverse FK order)
    await prisma.gameResult.deleteMany({ where: { gameId: game.id } });
    await prisma.scoreState.deleteMany({ where: { gameId: game.id } });
    await prisma.gameEvent.deleteMany({ where: { gameId: game.id } });
    await prisma.participation.deleteMany({ where: { gameId: game.id } });
    await prisma.game.delete({ where: { id: game.id } });
    await prisma.player.delete({ where: { id: playerA.id } });
    await prisma.player.delete({ where: { id: playerB.id } });
    await prisma.user.delete({ where: { id: owner.id } });

    void evt1;
    void evt2;
  });

  // ── Permission model ──────────────────────────────────────────────────────

  it('creates a Group with permissions and a UserGroup membership', async () => {
    const email = `perm-user-${uid()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'hashed',
        fullName: 'Perm User',
        nickname: `pu-${uid()}`,
        state: 'ACTIVE',
      },
    });

    const group = await prisma.group.create({
      data: { name: `NoInvite-${uid()}` },
    });

    await prisma.groupPermission.create({
      data: { groupId: group.id, permission: 'INVITE_USERS', granted: false },
    });

    await prisma.userGroup.create({
      data: { userId: user.id, groupId: group.id },
    });

    // Per-user override
    await prisma.userPermissionOverride.create({
      data: {
        userId: user.id,
        permission: 'CREATE_GAME',
        granted: false,
      },
    });

    const loadedGroup = await prisma.group.findUniqueOrThrow({
      where: { id: group.id },
      include: { permissions: true, members: true },
    });
    expect(loadedGroup.permissions).toHaveLength(1);
    expect(loadedGroup.members).toHaveLength(1);

    // cleanup
    await prisma.userPermissionOverride.delete({
      where: { userId_permission: { userId: user.id, permission: 'CREATE_GAME' } },
    });
    await prisma.userGroup.delete({
      where: { userId_groupId: { userId: user.id, groupId: group.id } },
    });
    await prisma.groupPermission.delete({
      where: { groupId_permission: { groupId: group.id, permission: 'INVITE_USERS' } },
    });
    await prisma.group.delete({ where: { id: group.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  // ── GlobalSetting singleton ────────────────────────────────────────────────

  it('upserts the GlobalSetting singleton and reads setup state', async () => {
    const gs = await prisma.globalSetting.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    expect(gs.id).toBe(1);
    expect(gs.setupCompletedAt).toBeNull();

    // cleanup
    await prisma.globalSetting.delete({ where: { id: 1 } }).catch(() => {
      // ok if it didn't exist to begin with
    });
  });

  // ── AuditLog ──────────────────────────────────────────────────────────────

  it('creates an AuditLog entry without an actor (system action)', async () => {
    const log = await prisma.auditLog.create({
      data: {
        action: 'SYSTEM_BOOT',
        metadata: { version: '1.0.0' },
      },
    });
    expect(log.actorUserId).toBeNull();
    expect(log.action).toBe('SYSTEM_BOOT');

    await prisma.auditLog.delete({ where: { id: log.id } });
  });
});
