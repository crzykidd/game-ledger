/**
 * Resets integration tests.
 * Requires DATABASE_URL pointing to a running Postgres with migrations applied.
 *
 * Tests the Definition-of-Done scenarios from prompt 03:
 *  - reset create → consume sets a new password
 *  - reset is single-use (GoneException on second consume)
 *  - reset revokes all existing sessions
 */
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { GoneException } from '@nestjs/common';
import { ResetsService } from './resets.service';
import { PasswordService } from '../auth/password.service';
import { AuditService } from '../audit/audit.service';
import { TokenStatus } from '@game-ledger/contract';
import { hashToken } from '../common/token.util';

const prisma = new PrismaClient();

function makeService() {
  const config = { get: () => undefined } as unknown as ConfigService;
  const passwordSvc = new PasswordService();
  const auditSvc = new AuditService(prisma as any);
  return { svc: new ResetsService(prisma as any, passwordSvc, auditSvc, config), passwordSvc };
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function createActiveUser(password: string) {
  const passwordSvc = new PasswordService();
  return prisma.user.create({
    data: {
      email: `reset-${uid()}@test.com`,
      passwordHash: await passwordSvc.hash(password),
      fullName: 'Reset Test User',
      nickname: `rtu-${uid()}`,
      role: 'SUPER_ADMIN',
      state: 'ACTIVE',
    },
  });
}

afterAll(() => prisma.$disconnect());

describe('ResetsService — createResetLink + consumeResetToken', () => {
  it('creates a reset link and returns a link with token', async () => {
    const { svc } = makeService();
    const user = await createActiveUser('Orig1Password!');

    const result = await svc.createResetLink(user.id, user.id);
    expect(result.link).toContain('/reset/');
    expect(result.targetUserId).toBe(user.id);

    await prisma.token.deleteMany({ where: { targetUserId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('consumes token, sets new password, and revokes sessions', async () => {
    const { svc, passwordSvc } = makeService();
    const origPassword = 'Orig1Password!';
    const newPassword = 'NewSecure1Pass!XYZ';
    const user = await createActiveUser(origPassword);

    // Create a session to ensure it gets revoked.
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(`sess-${uid()}`),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const { link } = await svc.createResetLink(user.id, user.id);
    const rawToken = link.split('/').pop()!;

    await svc.consumeResetToken(rawToken, { password: newPassword });

    // Verify new password works.
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    const valid = await passwordSvc.verify(updated!.passwordHash, newPassword);
    expect(valid).toBe(true);

    // Verify old password no longer works.
    const oldValid = await passwordSvc.verify(updated!.passwordHash, origPassword);
    expect(oldValid).toBe(false);

    // Verify all sessions are revoked.
    const activeSessions = await prisma.session.findMany({
      where: { userId: user.id, revokedAt: null },
    });
    expect(activeSessions).toHaveLength(0);

    // Verify token is consumed.
    const tokenHash = hashToken(rawToken);
    const token = await prisma.token.findFirst({ where: { tokenHash } });
    expect(token!.status).toBe(TokenStatus.CONSUMED);

    // Cleanup.
    await prisma.token.deleteMany({ where: { targetUserId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('is single-use — second consume throws GoneException', async () => {
    const { svc } = makeService();
    const user = await createActiveUser('Orig1Password!');

    const { link } = await svc.createResetLink(user.id, user.id);
    const rawToken = link.split('/').pop()!;

    await svc.consumeResetToken(rawToken, { password: 'NewSecure1Pass!XYZ' });

    await expect(
      svc.consumeResetToken(rawToken, { password: 'AnotherPass1!XYZ' }),
    ).rejects.toBeInstanceOf(GoneException);

    // Cleanup.
    await prisma.token.deleteMany({ where: { targetUserId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
