/**
 * Install wizard integration tests.
 * Requires DATABASE_URL pointing to a running Postgres with migrations applied.
 */
import { PrismaClient } from '@prisma/client';
import { SetupService } from './setup.service';
import { PasswordService } from '../auth/password.service';
import { ConflictException } from '@nestjs/common';
import { CreateFirstUserDto } from './setup.dto';

const prisma = new PrismaClient();

function makeSetupService() {
  const passwordSvc = new PasswordService();
  return new SetupService(prisma as any, passwordSvc);
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function makeDto(overrides: Partial<CreateFirstUserDto> = {}): CreateFirstUserDto {
  return {
    fullName: 'Super Admin',
    nickname: `sa-${uid()}`,
    email: `sa-${uid()}@example.com`,
    password: 'SuperAdmin1!',
    ...overrides,
  };
}

async function cleanupSuperAdmins() {
  const admins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' },
  });
  for (const a of admins) {
    // Find all players created by this admin
    const adminPlayers = await prisma.player.findMany({ where: { createdById: a.id } });
    const adminPlayerIds = adminPlayers.map((p) => p.id);

    if (adminPlayerIds.length > 0) {
      // Find participations for these players and delete their dependents first
      const participations = await prisma.participation.findMany({
        where: { playerId: { in: adminPlayerIds } },
      });
      const participationIds = participations.map((p) => p.id);

      if (participationIds.length > 0) {
        await prisma.scoreState.deleteMany({
          where: { participationId: { in: participationIds } },
        });
        await prisma.gameResult.deleteMany({
          where: { participationId: { in: participationIds } },
        });
        // Collect gameIds to potentially delete games
        const gameIds = [...new Set(participations.map((p) => p.gameId))];
        await prisma.participation.deleteMany({ where: { id: { in: participationIds } } });
        // Delete any games whose all participations we just deleted
        for (const gameId of gameIds) {
          const remaining = await prisma.participation.count({ where: { gameId } });
          if (remaining === 0) {
            await prisma.gameEvent.deleteMany({ where: { gameId } });
            await prisma.game.delete({ where: { id: gameId } });
          }
        }
      }

      await prisma.player.deleteMany({ where: { id: { in: adminPlayerIds } } });
    }

    await prisma.session.deleteMany({ where: { userId: a.id } });
    await prisma.token.deleteMany({ where: { createdById: a.id } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: a.id } });
    await prisma.user.delete({ where: { id: a.id } });
  }
  await prisma.globalSetting.deleteMany({ where: { id: 1 } });
}

afterAll(() => prisma.$disconnect());

describe('SetupService — install wizard', () => {
  beforeEach(async () => {
    await cleanupSuperAdmins();
  });

  afterEach(async () => {
    await cleanupSuperAdmins();
  });

  it('creates the first SUPER_ADMIN and marks setup complete', async () => {
    const svc = makeSetupService();
    const dto = makeDto();

    const result = await svc.runSetup(dto);
    expect(result.email).toBe(dto.email.toLowerCase());

    const user = await prisma.user.findUnique({ where: { email: dto.email } });
    expect(user?.role).toBe('SUPER_ADMIN');
    expect(user?.state).toBe('ACTIVE');

    const gs = await prisma.globalSetting.findUnique({ where: { id: 1 } });
    expect(gs?.setupCompletedAt).not.toBeNull();

    // Status endpoint reports complete.
    const status = await svc.getStatus();
    expect(status.setupComplete).toBe(true);

    // Self-Player must be created alongside the user.
    const selfPlayer = await prisma.player.findFirst({ where: { userId: user?.id } });
    expect(selfPlayer).not.toBeNull();
    expect(selfPlayer?.nickname).toBe(dto.nickname);
    expect(selfPlayer?.userId).toBe(user?.id);
  });

  it('blocks a second call after setup is complete', async () => {
    const svc = makeSetupService();
    await svc.runSetup(makeDto());

    // Second call must throw.
    await expect(svc.runSetup(makeDto())).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports setupComplete: false before setup', async () => {
    const svc = makeSetupService();
    const status = await svc.getStatus();
    expect(status.setupComplete).toBe(false);
  });
});
