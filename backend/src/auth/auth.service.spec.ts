/**
 * Login + lockout integration tests.
 * Requires DATABASE_URL pointing to a running Postgres with migrations applied.
 */
import { PrismaClient } from '@prisma/client';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { PermissionService } from '../rbac/permission.service';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

const prisma = new PrismaClient();

function makeServices() {
  const config = { get: () => undefined } as unknown as ConfigService;
  const passwordSvc = new PasswordService();
  const sessionSvc = new SessionService(prisma as any, config);
  const permSvc = new PermissionService(prisma as any);
  const authSvc = new AuthService(prisma as any, passwordSvc, sessionSvc, permSvc);
  return { authSvc, passwordSvc };
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function createActiveUser(email: string, password: string) {
  const { passwordSvc } = makeServices();
  return prisma.user.create({
    data: {
      email,
      passwordHash: await passwordSvc.hash(password),
      fullName: 'Auth Test User',
      nickname: `atu-${uid()}`,
      state: 'ACTIVE',
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('AuthService — login', () => {
  it('returns a session token on successful login', async () => {
    const { authSvc } = makeServices();
    const email = `login-ok-${uid()}@test.com`;
    const password = 'Valid1PassWd!';
    const user = await createActiveUser(email, password);

    const token = await authSvc.login(email, password);
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('throws 401 for wrong password', async () => {
    const { authSvc } = makeServices();
    const email = `login-bad-${uid()}@test.com`;
    const user = await createActiveUser(email, 'CorrectPass1!');

    await expect(authSvc.login(email, 'WrongPass999')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('throws 401 for unknown email (no user enumeration)', async () => {
    const { authSvc } = makeServices();
    await expect(authSvc.login('nobody@nowhere.com', 'AnyPass1234!')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('locks account after 5 failed attempts', async () => {
    const { authSvc } = makeServices();
    const email = `lockout-${uid()}@test.com`;
    const user = await createActiveUser(email, 'Correct1Pass!');

    // 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await authSvc.login(email, 'Wrong1').catch(() => {});
    }

    // Now correct password should still fail due to lockout.
    await expect(authSvc.login(email, 'Correct1Pass!')).rejects.toBeInstanceOf(ForbiddenException);

    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

describe('AuthService — patchMe', () => {
  it('updates the user themePref and returns MeResponse', async () => {
    const { authSvc } = makeServices();
    const email = `patchme-${uid()}@test.com`;
    const password = 'Patch1PassWd!';
    const user = await createActiveUser(email, password);

    const result = await authSvc.patchMe(user.id, { themePref: 'DARK' });

    expect(result.id).toBe(user.id);
    expect(result.themePref).toBe('DARK');
    expect(result.email).toBe(email);

    // Reset to SYSTEM pref
    const result2 = await authSvc.patchMe(user.id, { themePref: 'SYSTEM' });
    expect(result2.themePref).toBe('SYSTEM');

    await prisma.user.delete({ where: { id: user.id } });
  });
});
