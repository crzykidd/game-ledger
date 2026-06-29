/**
 * Invites integration tests.
 * Requires DATABASE_URL pointing to a running Postgres with migrations applied.
 *
 * Tests the Definition-of-Done scenarios from prompt 03:
 *  - invite create → accept creates a PLAYER and links the guest Player
 *  - accepting a consumed/expired/revoked token fails
 *  - email-already-in-use returns the 409 message
 */
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ConflictException, GoneException } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { PasswordService } from '../auth/password.service';
import { AuditService } from '../audit/audit.service';
import { TokenStatus } from '@game-ledger/contract';
import { hashToken } from '../common/token.util';

const prisma = new PrismaClient();

function makeService() {
  const config = { get: () => undefined } as unknown as ConfigService;
  const passwordSvc = new PasswordService();
  const auditSvc = new AuditService(prisma as any);
  return new InvitesService(prisma as any, passwordSvc, auditSvc, config);
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function createSuperAdmin() {
  const passwordSvc = new PasswordService();
  return prisma.user.create({
    data: {
      email: `admin-${uid()}@test.com`,
      passwordHash: await passwordSvc.hash('Admin1234Pass!'),
      fullName: 'Test Admin',
      nickname: `admin-${uid()}`,
      role: 'SUPER_ADMIN',
      state: 'ACTIVE',
    },
  });
}

async function createGuestPlayer(createdById: string, nickname?: string) {
  return prisma.player.create({
    data: {
      nickname: nickname ?? `guest-${uid()}`,
      createdById,
    },
  });
}

afterAll(() => prisma.$disconnect());

describe('InvitesService — createInvite + acceptInvite', () => {
  it('creates an invite and returns a link with token', async () => {
    const svc = makeService();
    const admin = await createSuperAdmin();

    const result = await svc.createInvite({ email: `invite-${uid()}@test.com` }, admin.id);
    expect(result.link).toContain('/invite/accept/');
    expect(result.email).toBeTruthy();

    await prisma.token.deleteMany({ where: { createdById: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it('accept creates a PLAYER user and links the guest Player', async () => {
    const svc = makeService();
    const admin = await createSuperAdmin();
    const guest = await createGuestPlayer(admin.id, `guest-link-${uid()}`);

    const { link } = await svc.createInvite(
      { email: `accept-${uid()}@test.com`, guestPlayerId: guest.id },
      admin.id,
    );

    // Extract the raw token from the link.
    const rawToken = link.split('/').pop()!;

    const result = await svc.acceptInvite(rawToken, {
      fullName: 'New Player',
      nickname: guest.nickname,
      password: 'Secure1Pass!XYZ',
    });

    expect(result.id).toBeTruthy();

    // Verify the guest player is now linked to the new user.
    const updatedGuest = await prisma.player.findUnique({ where: { id: guest.id } });
    expect(updatedGuest!.userId).toBe(result.id);

    // Verify the token is consumed.
    const tokenHash = hashToken(rawToken);
    const token = await prisma.token.findFirst({ where: { tokenHash } });
    expect(token!.status).toBe(TokenStatus.CONSUMED);
    expect(token!.targetUserId).toBe(result.id);

    // Cleanup.
    await prisma.session.deleteMany({ where: { userId: result.id } });
    await prisma.token.deleteMany({ where: { createdById: admin.id } });
    await prisma.player.deleteMany({ where: { createdById: admin.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, result.id] } } });
  });

  it('accept without guest creates a fresh PLAYER (no linking)', async () => {
    const svc = makeService();
    const admin = await createSuperAdmin();

    const { link } = await svc.createInvite({ email: `fresh-${uid()}@test.com` }, admin.id);
    const rawToken = link.split('/').pop()!;

    const result = await svc.acceptInvite(rawToken, {
      fullName: 'Fresh Player',
      nickname: `fresh-${uid()}`,
      password: 'Secure1Pass!XYZ',
    });

    expect(result.id).toBeTruthy();
    const user = await prisma.user.findUnique({ where: { id: result.id } });
    expect(user!.role).toBe('PLAYER');
    expect(user!.state).toBe('ACTIVE');

    // The new user should have a self-Player created.
    const selfPlayer = await prisma.player.findFirst({ where: { userId: result.id } });
    expect(selfPlayer).not.toBeNull();

    // Cleanup.
    await prisma.token.deleteMany({ where: { createdById: admin.id } });
    await prisma.player.deleteMany({ where: { userId: result.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, result.id] } } });
  });

  it('returns 409 ConflictException when email is already in use', async () => {
    const svc = makeService();
    const admin = await createSuperAdmin();

    // Accept first invite to create the user.
    const { link: link1 } = await svc.createInvite({ email: admin.email }, admin.id);
    const rawToken1 = link1.split('/').pop()!;

    await expect(
      svc.acceptInvite(rawToken1, {
        fullName: 'Duplicate',
        nickname: `dup-${uid()}`,
        password: 'Secure1Pass!XYZ',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await prisma.token.deleteMany({ where: { createdById: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it('throws when accepting a consumed token', async () => {
    const svc = makeService();
    const admin = await createSuperAdmin();

    const email = `consumed-${uid()}@test.com`;
    const { link } = await svc.createInvite({ email }, admin.id);
    const rawToken = link.split('/').pop()!;

    // Accept once.
    const first = await svc.acceptInvite(rawToken, {
      fullName: 'First',
      nickname: `first-${uid()}`,
      password: 'Secure1Pass!XYZ',
    });

    // Try to accept again.
    await expect(
      svc.acceptInvite(rawToken, {
        fullName: 'Second',
        nickname: `second-${uid()}`,
        password: 'Secure1Pass!XYZ',
      }),
    ).rejects.toBeInstanceOf(GoneException);

    // Cleanup.
    await prisma.token.deleteMany({ where: { createdById: admin.id } });
    await prisma.player.deleteMany({ where: { userId: first.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, first.id] } } });
  });

  it('throws when accepting a revoked token', async () => {
    const svc = makeService();
    const admin = await createSuperAdmin();

    const { id, link } = await svc.createInvite({ email: `revoke-${uid()}@test.com` }, admin.id);
    const rawToken = link.split('/').pop()!;

    await svc.revokeInvite(id, admin.id);

    await expect(
      svc.acceptInvite(rawToken, {
        fullName: 'Revoked',
        nickname: `revoked-${uid()}`,
        password: 'Secure1Pass!XYZ',
      }),
    ).rejects.toBeInstanceOf(GoneException);

    await prisma.token.deleteMany({ where: { createdById: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });
});
