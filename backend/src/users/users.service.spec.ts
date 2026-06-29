/**
 * Users service integration tests.
 * Requires DATABASE_URL pointing to a running Postgres with migrations applied.
 *
 * Tests the Definition-of-Done scenarios from prompt 03:
 *  - includeDisabled hides DISABLED by default; disable blocks login but keeps the row
 *  - tier enforcement: MANAGER cannot disable/role-change an ADMIN; SUPER_ADMIN can
 *  - permission/group overrides change effective permissions
 */
import { PrismaClient } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PermissionService } from '../rbac/permission.service';
import { AuditService } from '../audit/audit.service';
import { Role, UserState, Permission } from '@game-ledger/contract';
import { PasswordService } from '../auth/password.service';

const prisma = new PrismaClient();

function makeService() {
  const permSvc = new PermissionService(prisma as any);
  const auditSvc = new AuditService(prisma as any);
  return new UsersService(prisma as any, permSvc, auditSvc);
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function createUser(role: Role, state: UserState = UserState.ACTIVE) {
  const passwordSvc = new PasswordService();
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${uid()}@test.com`,
      passwordHash: await passwordSvc.hash('Test1Password!'),
      fullName: `Test ${role}`,
      nickname: `${role.toLowerCase()}-${uid()}`,
      role,
      state,
    },
  });
}

afterAll(() => prisma.$disconnect());

describe('UsersService — listUsers', () => {
  it('hides DISABLED users by default', async () => {
    const svc = makeService();
    const active = await createUser(Role.PLAYER, UserState.ACTIVE);
    const disabled = await createUser(Role.PLAYER, UserState.DISABLED);

    const list = await svc.listUsers(false);
    const ids = list.map((u) => u.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(disabled.id);

    await prisma.user.deleteMany({ where: { id: { in: [active.id, disabled.id] } } });
  });

  it('includes DISABLED users when includeDisabled=true', async () => {
    const svc = makeService();
    const disabled = await createUser(Role.PLAYER, UserState.DISABLED);

    const list = await svc.listUsers(true);
    const ids = list.map((u) => u.id);
    expect(ids).toContain(disabled.id);

    await prisma.user.delete({ where: { id: disabled.id } });
  });
});

describe('UsersService — disableUser / enableUser', () => {
  it('disables a user and keeps the row', async () => {
    const svc = makeService();
    const superAdmin = await createUser(Role.SUPER_ADMIN);
    const player = await createUser(Role.PLAYER);

    await svc.disableUser(player.id, Role.SUPER_ADMIN, superAdmin.id);

    const found = await prisma.user.findUnique({ where: { id: player.id } });
    expect(found).not.toBeNull();
    expect(found!.state).toBe(UserState.DISABLED);

    await prisma.user.deleteMany({ where: { id: { in: [superAdmin.id, player.id] } } });
  });

  it('MANAGER cannot disable an ADMIN (tier enforcement)', async () => {
    const svc = makeService();
    const manager = await createUser(Role.MANAGER);
    const admin = await createUser(Role.ADMIN);

    await expect(svc.disableUser(admin.id, Role.MANAGER, manager.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    await prisma.user.deleteMany({ where: { id: { in: [manager.id, admin.id] } } });
  });

  it('ADMIN cannot role-change another ADMIN', async () => {
    const svc = makeService();
    const admin1 = await createUser(Role.ADMIN);
    const admin2 = await createUser(Role.ADMIN);

    await expect(
      svc.patchUser(admin2.id, { role: Role.PLAYER }, Role.ADMIN, admin1.id),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await prisma.user.deleteMany({ where: { id: { in: [admin1.id, admin2.id] } } });
  });

  it('SUPER_ADMIN can disable an ADMIN', async () => {
    const svc = makeService();
    const superAdmin = await createUser(Role.SUPER_ADMIN);
    const admin = await createUser(Role.ADMIN);

    // Need another SUPER_ADMIN to prevent sole-SUPER_ADMIN protection triggering on superAdmin.
    await svc.disableUser(admin.id, Role.SUPER_ADMIN, superAdmin.id);

    const found = await prisma.user.findUnique({ where: { id: admin.id } });
    expect(found!.state).toBe(UserState.DISABLED);

    await prisma.user.deleteMany({ where: { id: { in: [superAdmin.id, admin.id] } } });
  });

  it('disableUser revokes all active sessions', async () => {
    const svc = makeService();
    const superAdmin = await createUser(Role.SUPER_ADMIN);
    const player = await createUser(Role.PLAYER);

    // Create a session.
    await prisma.session.create({
      data: {
        userId: player.id,
        tokenHash: `hash-disable-${uid()}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    await svc.disableUser(player.id, Role.SUPER_ADMIN, superAdmin.id);

    const active = await prisma.session.findMany({
      where: { userId: player.id, revokedAt: null },
    });
    expect(active).toHaveLength(0);

    await prisma.session.deleteMany({ where: { userId: player.id } });
    await prisma.user.deleteMany({ where: { id: { in: [superAdmin.id, player.id] } } });
  });
});

describe('UsersService — permission and group overrides', () => {
  it('per-user permission override changes effective permissions', async () => {
    const svc = makeService();
    const permSvc = new PermissionService(prisma as any);
    const player = await createUser(Role.PLAYER);

    // Player has INVITE_USERS by default. Deny it.
    await svc.setUserPermissions(
      player.id,
      { overrides: [{ permission: Permission.INVITE_USERS, granted: false }] },
      Role.SUPER_ADMIN,
      player.id, // actor doesn't matter for the test; using player.id as a stand-in
    );

    const effective = await permSvc.resolveEffectivePermissions(player.id, Role.PLAYER);
    expect(effective.has(Permission.INVITE_USERS)).toBe(false);

    await prisma.userPermissionOverride.deleteMany({ where: { userId: player.id } });
    await prisma.user.delete({ where: { id: player.id } });
  });

  it('group permission override changes effective permissions', async () => {
    const svc = makeService();
    const permSvc = new PermissionService(prisma as any);
    const player = await createUser(Role.PLAYER);

    // Create a group that denies INVITE_USERS.
    const group = await prisma.group.create({
      data: {
        name: `no-invite-${uid()}`,
        permissions: {
          create: [{ permission: Permission.INVITE_USERS, granted: false }],
        },
      },
    });

    // Set the user's groups.
    await svc.setUserGroups(player.id, { groupIds: [group.id] }, Role.SUPER_ADMIN, player.id);

    const effective = await permSvc.resolveEffectivePermissions(player.id, Role.PLAYER);
    expect(effective.has(Permission.INVITE_USERS)).toBe(false);

    // Cleanup.
    await prisma.userGroup.deleteMany({ where: { userId: player.id } });
    await prisma.groupPermission.deleteMany({ where: { groupId: group.id } });
    await prisma.group.delete({ where: { id: group.id } });
    await prisma.user.delete({ where: { id: player.id } });
  });
});
