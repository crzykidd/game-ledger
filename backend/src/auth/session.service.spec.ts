/**
 * Session lifecycle integration tests.
 * Requires DATABASE_URL pointing to a running Postgres with migrations applied.
 */
import { PrismaClient } from '@prisma/client';
import { SessionService } from './session.service';
import { ConfigService } from '@nestjs/config';

const prisma = new PrismaClient();

function makeSessionService(overrides: Record<string, string> = {}) {
  const config = {
    get: (key: string) => overrides[key] ?? undefined,
  } as unknown as ConfigService;
  return new SessionService(prisma as any, config);
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function createTestUser() {
  return prisma.user.create({
    data: {
      email: `sess-${uid()}@test.com`,
      passwordHash: 'hash',
      fullName: 'Session Test',
      nickname: `st-${uid()}`,
      state: 'ACTIVE',
    },
  });
}

afterAll(() => prisma.$disconnect());

describe('SessionService — session lifecycle', () => {
  it('creates a session and validates the raw token', async () => {
    const svc = makeSessionService();
    const user = await createTestUser();

    const { rawToken, session } = await svc.createSession(user.id);

    expect(rawToken).toHaveLength(64); // 32 bytes → 64 hex chars
    expect(session.userId).toBe(user.id);
    expect(session.revokedAt).toBeNull();
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const validated = await svc.validateSession(rawToken);
    expect(validated).not.toBeNull();
    expect(validated?.user.id).toBe(user.id);

    // cleanup
    await prisma.session.delete({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects an unknown token', async () => {
    const svc = makeSessionService();
    const result = await svc.validateSession('0'.repeat(64));
    expect(result).toBeNull();
  });

  it('rejects an expired session', async () => {
    const svc = makeSessionService();
    const user = await createTestUser();

    // Create session that expires in the past.
    const { rawToken, session } = await svc.createSession(user.id);
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await svc.validateSession(rawToken);
    expect(result).toBeNull();

    await prisma.session.delete({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('rejects a revoked session', async () => {
    const svc = makeSessionService();
    const user = await createTestUser();

    const { rawToken } = await svc.createSession(user.id);

    await svc.revokeSession(rawToken);

    const result = await svc.validateSession(rawToken);
    expect(result).toBeNull();

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('logout-all revokes all sessions for a user', async () => {
    const svc = makeSessionService();
    const user = await createTestUser();

    const { rawToken: t1 } = await svc.createSession(user.id);
    const { rawToken: t2 } = await svc.createSession(user.id);

    await svc.revokeAllSessions(user.id);

    expect(await svc.validateSession(t1)).toBeNull();
    expect(await svc.validateSession(t2)).toBeNull();

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
