/**
 * Groups service integration tests.
 * Requires DATABASE_URL pointing to a running Postgres with migrations applied.
 */
import { PrismaClient } from '@prisma/client';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { AuditService } from '../audit/audit.service';
import { Permission } from '@game-ledger/contract';
import { PasswordService } from '../auth/password.service';

const prisma = new PrismaClient();

function makeService() {
  const auditSvc = new AuditService(prisma as any);
  return new GroupsService(prisma as any, auditSvc);
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function createSuperAdmin() {
  const passwordSvc = new PasswordService();
  return prisma.user.create({
    data: {
      email: `grp-admin-${uid()}@test.com`,
      passwordHash: await passwordSvc.hash('Admin1234Pass!'),
      fullName: 'Group Admin',
      nickname: `gadmin-${uid()}`,
      role: 'SUPER_ADMIN',
      state: 'ACTIVE',
    },
  });
}

afterAll(() => prisma.$disconnect());

describe('GroupsService — CRUD', () => {
  it('creates a group', async () => {
    const svc = makeService();
    const admin = await createSuperAdmin();
    const groupName = `test-group-${uid()}`;

    const group = await svc.createGroup({ name: groupName }, admin.id);
    expect(group.name).toBe(groupName);
    expect(group.id).toBeTruthy();

    await prisma.group.delete({ where: { id: group.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it('throws ConflictException for duplicate group name', async () => {
    const svc = makeService();
    const admin = await createSuperAdmin();
    const groupName = `dup-group-${uid()}`;

    const group = await svc.createGroup({ name: groupName }, admin.id);

    await expect(svc.createGroup({ name: groupName }, admin.id)).rejects.toBeInstanceOf(
      ConflictException,
    );

    await prisma.group.delete({ where: { id: group.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it('throws NotFoundException for missing group', async () => {
    const svc = makeService();
    await expect(svc.getGroup('nonexistent-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets group permissions and replaces existing', async () => {
    const svc = makeService();
    const admin = await createSuperAdmin();

    const group = await svc.createGroup({ name: `perm-group-${uid()}` }, admin.id);

    // Set initial permissions.
    await svc.setGroupPermissions(
      group.id,
      {
        permissions: [
          { permission: Permission.INVITE_USERS, granted: false },
          { permission: Permission.CREATE_GAME, granted: true },
        ],
      },
      admin.id,
    );

    const fetched = await svc.getGroup(group.id);
    const perms = fetched.permissions;
    expect(perms).toHaveLength(2);

    const invitePerm = perms.find((p) => p.permission === Permission.INVITE_USERS);
    expect(invitePerm!.granted).toBe(false);

    // Replace with a single permission.
    await svc.setGroupPermissions(
      group.id,
      { permissions: [{ permission: Permission.CREATE_GAME, granted: false }] },
      admin.id,
    );

    const fetched2 = await svc.getGroup(group.id);
    expect(fetched2.permissions).toHaveLength(1);

    await prisma.groupPermission.deleteMany({ where: { groupId: group.id } });
    await prisma.group.delete({ where: { id: group.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it('deletes a group', async () => {
    const svc = makeService();
    const admin = await createSuperAdmin();

    const group = await svc.createGroup({ name: `del-group-${uid()}` }, admin.id);
    await svc.deleteGroup(group.id, admin.id);

    await expect(svc.getGroup(group.id)).rejects.toBeInstanceOf(NotFoundException);

    await prisma.user.delete({ where: { id: admin.id } });
  });
});
