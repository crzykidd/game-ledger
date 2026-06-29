/**
 * Players + playgroups service integration tests.
 * Requires DATABASE_URL pointing to a running Postgres with migrations applied.
 */
import { PrismaClient } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
import { PlayersService } from './players.service';
import { PermissionService } from '../rbac/permission.service';
import { PasswordService } from '../auth/password.service';
import { Role } from '@game-ledger/contract';

const prisma = new PrismaClient();

function makeService() {
  const permSvc = new PermissionService(prisma as any);
  return new PlayersService(prisma as any, permSvc);
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

async function createUser(role: Role.SUPER_ADMIN | Role.MANAGER | Role.PLAYER = Role.PLAYER) {
  const passwordSvc = new PasswordService();
  return prisma.user.create({
    data: {
      email: `pl-${uid()}@test.com`,
      passwordHash: await passwordSvc.hash('Test1234!@'),
      fullName: 'Test User',
      nickname: `tuser-${uid()}`,
      role,
      state: 'ACTIVE',
    },
  });
}

afterAll(() => prisma.$disconnect());

// ─── Player / roster tests ──────────────────────────────────────────────────

describe('PlayersService — guest creation + roster scoping', () => {
  it('creates a guest player owned by the caller', async () => {
    const svc = makeService();
    const actor = await createUser();

    const guest = await svc.createGuestPlayer({ nickname: 'Alice' }, actor.id);

    expect(guest.nickname).toBe('Alice');
    expect(guest.userId).toBeNull(); // guest has no linked user
    expect(guest.createdById).toBe(actor.id);

    // Cleanup
    await prisma.player.delete({ where: { id: guest.id } });
    await prisma.user.delete({ where: { id: actor.id } });
  });

  it("guest appears in creator's roster but not another user's roster", async () => {
    const svc = makeService();
    const creator = await createUser();
    const other = await createUser();

    const guest = await svc.createGuestPlayer({ nickname: 'RosterBob' }, creator.id);

    const creatorRoster = await svc.listPlayers(creator.id, Role.PLAYER);
    expect(creatorRoster.some((p) => p.id === guest.id)).toBe(true);

    const otherRoster = await svc.listPlayers(other.id, Role.PLAYER);
    expect(otherRoster.some((p) => p.id === guest.id)).toBe(false);

    // Cleanup
    await prisma.player.delete({ where: { id: guest.id } });
    await prisma.user.delete({ where: { id: creator.id } });
    await prisma.user.delete({ where: { id: other.id } });
  });

  it('MANAGER / viewAll can list all players', async () => {
    const svc = makeService();
    const creator = await createUser();
    const manager = await createUser(Role.MANAGER); // MANAGER has VIEW_ALL by default

    const guest = await svc.createGuestPlayer({ nickname: 'ManagerSee' }, creator.id);

    const managerRoster = await svc.listPlayers(manager.id, Role.MANAGER);
    expect(managerRoster.some((p) => p.id === guest.id)).toBe(true);

    // Cleanup
    await prisma.player.delete({ where: { id: guest.id } });
    await prisma.user.delete({ where: { id: creator.id } });
    await prisma.user.delete({ where: { id: manager.id } });
  });
});

describe('PlayersService — rename ownership rules', () => {
  it('renames a guest player you own', async () => {
    const svc = makeService();
    const actor = await createUser();

    const guest = await svc.createGuestPlayer({ nickname: 'BeforeRename' }, actor.id);
    const renamed = await svc.renamePlayer(
      guest.id,
      { nickname: 'AfterRename' },
      actor.id,
      Role.PLAYER,
    );

    expect(renamed.nickname).toBe('AfterRename');

    // Cleanup
    await prisma.player.delete({ where: { id: guest.id } });
    await prisma.user.delete({ where: { id: actor.id } });
  });

  it("cannot rename a player you don't own (as PLAYER)", async () => {
    const svc = makeService();
    const creator = await createUser();
    const other = await createUser();

    const guest = await svc.createGuestPlayer({ nickname: 'NotYours' }, creator.id);

    await expect(
      svc.renamePlayer(guest.id, { nickname: 'Hijack' }, other.id, Role.PLAYER),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Cleanup
    await prisma.player.delete({ where: { id: guest.id } });
    await prisma.user.delete({ where: { id: creator.id } });
    await prisma.user.delete({ where: { id: other.id } });
  });

  it('cannot rename a linked (registered) player', async () => {
    const svc = makeService();
    const actor = await createUser();

    // Create a Player row that is linked to a user (simulating invite-accept).
    const linkedPlayer = await prisma.player.create({
      data: {
        nickname: 'LinkedGuy',
        userId: actor.id, // linked
        createdById: actor.id,
      },
    });

    await expect(
      svc.renamePlayer(linkedPlayer.id, { nickname: 'NewName' }, actor.id, Role.PLAYER),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Cleanup
    await prisma.player.delete({ where: { id: linkedPlayer.id } });
    await prisma.user.delete({ where: { id: actor.id } });
  });

  it('MANAGER can rename a guest they do not own', async () => {
    const svc = makeService();
    const creator = await createUser();
    const manager = await createUser(Role.MANAGER);

    const guest = await svc.createGuestPlayer({ nickname: 'GuestOfCreator' }, creator.id);

    const result = await svc.renamePlayer(
      guest.id,
      { nickname: 'RenamedByManager' },
      manager.id,
      Role.MANAGER,
    );
    expect(result.nickname).toBe('RenamedByManager');

    // Cleanup
    await prisma.player.delete({ where: { id: guest.id } });
    await prisma.user.delete({ where: { id: creator.id } });
    await prisma.user.delete({ where: { id: manager.id } });
  });
});

// ─── Playgroup tests ─────────────────────────────────────────────────────────

describe('PlayersService — playgroup CRUD', () => {
  it('creates a playgroup with initial members (guest + registered)', async () => {
    const svc = makeService();
    const owner = await createUser();
    const registered = await createUser();

    const guest = await svc.createGuestPlayer({ nickname: 'GuestA' }, owner.id);

    // Create a linked Player for the registered user.
    const registeredPlayer = await prisma.player.create({
      data: { nickname: 'RegPlayer', userId: registered.id, createdById: owner.id },
    });

    const pg = await svc.createPlaygroup(
      { name: 'Poker Night', memberPlayerIds: [guest.id, registeredPlayer.id] },
      owner.id,
    );

    expect(pg.name).toBe('Poker Night');
    expect(pg.createdById).toBe(owner.id);
    expect(pg.members).toHaveLength(2);

    const memberIds = pg.members.map((m: { id: string }) => m.id);
    expect(memberIds).toContain(guest.id);
    expect(memberIds).toContain(registeredPlayer.id);

    // Cleanup
    await prisma.playgroupMember.deleteMany({ where: { playgroupId: pg.id } });
    await prisma.playgroup.delete({ where: { id: pg.id } });
    await prisma.player.deleteMany({ where: { id: { in: [guest.id, registeredPlayer.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, registered.id] } } });
  });

  it('lists only playgroups the caller belongs to or created', async () => {
    const svc = makeService();
    const owner = await createUser();
    const bystander = await createUser();

    const pg = await svc.createPlaygroup({ name: 'PrivateGroup' }, owner.id);

    const ownerGroups = await svc.listPlaygroups(owner.id, Role.PLAYER);
    expect(ownerGroups.some((g: { id: string }) => g.id === pg.id)).toBe(true);

    const bystanderGroups = await svc.listPlaygroups(bystander.id, Role.PLAYER);
    expect(bystanderGroups.some((g: { id: string }) => g.id === pg.id)).toBe(false);

    // Cleanup
    await prisma.playgroup.delete({ where: { id: pg.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, bystander.id] } } });
  });

  it('renames a playgroup (owner can rename it)', async () => {
    const svc = makeService();
    const owner = await createUser();
    const pg = await svc.createPlaygroup({ name: 'OldName' }, owner.id);

    const renamed = await svc.renamePlaygroup(pg.id, { name: 'NewName' }, owner.id, Role.PLAYER);
    expect(renamed.name).toBe('NewName');

    // Cleanup
    await prisma.playgroup.delete({ where: { id: pg.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });
});

describe('PlayersService — membership add/remove', () => {
  it('adds and removes a member; Player row is intact after removal', async () => {
    const svc = makeService();
    const owner = await createUser();
    const pg = await svc.createPlaygroup({ name: 'MemberTest' }, owner.id);

    const guest = await svc.createGuestPlayer({ nickname: 'TempMember' }, owner.id);

    // Add
    const withMember = await svc.addMember(pg.id, guest.id, owner.id, Role.PLAYER);
    expect(withMember.members.some((m: { id: string }) => m.id === guest.id)).toBe(true);

    // Remove
    const withoutMember = await svc.removeMember(pg.id, guest.id, owner.id, Role.PLAYER);
    expect(withoutMember.members.some((m: { id: string }) => m.id === guest.id)).toBe(false);

    // Player row must still exist.
    const stillExists = await prisma.player.findUnique({ where: { id: guest.id } });
    expect(stillExists).not.toBeNull();
    expect(stillExists!.nickname).toBe('TempMember');

    // Cleanup
    await prisma.player.delete({ where: { id: guest.id } });
    await prisma.playgroup.delete({ where: { id: pg.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });

  it('sets the full member list via PUT (replacing existing)', async () => {
    const svc = makeService();
    const owner = await createUser();
    const pg = await svc.createPlaygroup({ name: 'SetMembersTest' }, owner.id);

    const p1 = await svc.createGuestPlayer({ nickname: 'P1' }, owner.id);
    const p2 = await svc.createGuestPlayer({ nickname: 'P2' }, owner.id);
    const p3 = await svc.createGuestPlayer({ nickname: 'P3' }, owner.id);

    // Set p1 + p2
    await svc.setMembers(pg.id, { playerIds: [p1.id, p2.id] }, owner.id, Role.PLAYER);
    // Replace with p3 only
    const result = await svc.setMembers(pg.id, { playerIds: [p3.id] }, owner.id, Role.PLAYER);

    const memberIds = result.members.map((m: { id: string }) => m.id);
    expect(memberIds).not.toContain(p1.id);
    expect(memberIds).not.toContain(p2.id);
    expect(memberIds).toContain(p3.id);

    // Cleanup
    await prisma.playgroupMember.deleteMany({ where: { playgroupId: pg.id } });
    await prisma.playgroup.delete({ where: { id: pg.id } });
    await prisma.player.deleteMany({ where: { id: { in: [p1.id, p2.id, p3.id] } } });
    await prisma.user.delete({ where: { id: owner.id } });
  });
});

describe('PlayersService — authorization enforcement', () => {
  it('non-owner PLAYER cannot modify another playgroup membership', async () => {
    const svc = makeService();
    const owner = await createUser();
    const intruder = await createUser();

    const pg = await svc.createPlaygroup({ name: 'OwnerGroup' }, owner.id);
    const guest = await svc.createGuestPlayer({ nickname: 'SomeGuest' }, owner.id);

    await expect(svc.addMember(pg.id, guest.id, intruder.id, Role.PLAYER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    await expect(
      svc.setMembers(pg.id, { playerIds: [guest.id] }, intruder.id, Role.PLAYER),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Cleanup
    await prisma.player.delete({ where: { id: guest.id } });
    await prisma.playgroup.delete({ where: { id: pg.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
  });

  it('MANAGER can manage another user playgroup membership', async () => {
    const svc = makeService();
    const owner = await createUser();
    const manager = await createUser(Role.MANAGER);

    const pg = await svc.createPlaygroup({ name: 'ManagerManaged' }, owner.id);
    const guest = await svc.createGuestPlayer({ nickname: 'ManagerGuest' }, owner.id);

    // MANAGER has MANAGE_USERS → can manage membership
    const result = await svc.addMember(pg.id, guest.id, manager.id, Role.MANAGER);
    expect(result.members.some((m: { id: string }) => m.id === guest.id)).toBe(true);

    // Cleanup
    await prisma.playgroupMember.deleteMany({ where: { playgroupId: pg.id } });
    await prisma.playgroup.delete({ where: { id: pg.id } });
    await prisma.player.delete({ where: { id: guest.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, manager.id] } } });
  });
});

describe('PlayersService — self-Player backfill', () => {
  it('backfillSelfPlayers creates a Player for a user with none', async () => {
    const svc = makeService();
    const user = await createUser();

    // No player row yet for this user.
    await svc.backfillSelfPlayers();

    const selfPlayer = await prisma.player.findFirst({ where: { userId: user.id } });
    expect(selfPlayer).not.toBeNull();
    expect(selfPlayer?.nickname).toBe(user.nickname);

    // Cleanup
    await prisma.player.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('backfillSelfPlayers is idempotent (no duplicate self-Player)', async () => {
    const svc = makeService();
    const user = await createUser();

    await svc.backfillSelfPlayers();
    await svc.backfillSelfPlayers(); // run twice

    const selfPlayers = await prisma.player.findMany({ where: { userId: user.id } });
    expect(selfPlayers).toHaveLength(1);

    // Cleanup
    await prisma.player.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
