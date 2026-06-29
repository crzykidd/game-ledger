import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../rbac/permission.service';
import { Permission, Role } from '@game-ledger/contract';
import {
  CreateGuestPlayerDto,
  RenamePlayerDto,
  CreatePlaygroupDto,
  RenamePlaygroupDto,
  SetMembersDto,
} from './players.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shape returned for a Player in list / detail responses.
 * Includes whether the player is a guest and, if linked, the user's nickname.
 */
const playerSelect = {
  id: true,
  nickname: true,
  userId: true,
  createdById: true,
  createdAt: true,
  linkedUser: {
    select: { id: true, nickname: true, email: true },
  },
} as const;

@Injectable()
export class PlayersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlayersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.backfillSelfPlayers();
  }

  /** Ensure every User has at least one self-Player (userId = user.id). Idempotent. */
  async backfillSelfPlayers(): Promise<void> {
    const usersWithoutSelfPlayer = await this.prisma.user.findMany({
      where: { players: { none: {} } },
      select: { id: true, nickname: true },
    });
    for (const user of usersWithoutSelfPlayer) {
      // Guard against races: check again before creating.
      const existing = await this.prisma.player.findFirst({ where: { userId: user.id } });
      if (!existing) {
        await this.prisma.player.create({
          data: { nickname: user.nickname, userId: user.id, createdById: user.id },
        });
        this.logger.log(`Backfilled self-Player for user ${user.id} (${user.nickname})`);
      }
    }
  }

  // ─── Player helpers ─────────────────────────────────────────────────────────

  private async hasPermission(userId: string, role: Role, perm: Permission): Promise<boolean> {
    const perms = await this.permissionService.resolveEffectivePermissions(userId, role);
    return perms.has(perm);
  }

  // ─── Players / roster ───────────────────────────────────────────────────────

  /**
   * POST /api/players — create a guest Player owned by the caller.
   * Nickname uniqueness is NOT enforced globally; it is scoped per-playgroup
   * (enforced at game start when participants are selected into a group context).
   */
  async createGuestPlayer(dto: CreateGuestPlayerDto, actorId: string) {
    if (!dto.nickname?.trim()) {
      throw new BadRequestException('Nickname is required.');
    }

    return this.prisma.player.create({
      data: {
        nickname: dto.nickname.trim(),
        createdById: actorId,
        // userId remains null → guest
      },
      select: playerSelect,
    });
  }

  /**
   * GET /api/players — caller's roster (guests they created + their own Player row if any).
   * Managers / VIEW_ALL see everyone.
   */
  async listPlayers(actorId: string, actorRole: Role) {
    const canViewAll = await this.hasPermission(actorId, actorRole, Permission.VIEW_ALL);

    const where = canViewAll
      ? {} // no filter — see everything
      : {
          OR: [
            { createdById: actorId }, // guests I created
            { userId: actorId }, // my own linked Player row
          ],
        };

    return this.prisma.player.findMany({
      where,
      select: playerSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** GET /api/players/:id */
  async getPlayer(id: string, actorId: string, actorRole: Role) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      select: playerSelect,
    });
    if (!player) throw new NotFoundException(`Player ${id} not found.`);

    const canViewAll = await this.hasPermission(actorId, actorRole, Permission.VIEW_ALL);
    if (!canViewAll) {
      const isOwner = player.createdById === actorId || player.userId === actorId;
      if (!isOwner) {
        throw new ForbiddenException('You do not have access to this player.');
      }
    }

    return player;
  }

  /**
   * PATCH /api/players/:id — rename a guest Player you own.
   * Cannot rename a Player that is already linked to a registered user account.
   */
  async renamePlayer(id: string, dto: RenamePlayerDto, actorId: string, actorRole: Role) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      select: { id: true, userId: true, createdById: true, nickname: true },
    });
    if (!player) throw new NotFoundException(`Player ${id} not found.`);

    // Linked accounts cannot be renamed via the player roster endpoint.
    if (player.userId !== null) {
      throw new ForbiddenException(
        'Cannot rename a player that is linked to a registered account.',
      );
    }

    const canManageUsers = await this.hasPermission(actorId, actorRole, Permission.MANAGE_USERS);
    const isOwner = player.createdById === actorId;
    if (!isOwner && !canManageUsers) {
      throw new ForbiddenException('You do not own this guest player.');
    }

    if (!dto.nickname?.trim()) {
      throw new BadRequestException('Nickname is required.');
    }

    return this.prisma.player.update({
      where: { id },
      data: { nickname: dto.nickname.trim() },
      select: playerSelect,
    });
  }

  // ─── Playgroups ──────────────────────────────────────────────────────────────

  private async assertPlaygroupAccess(
    playgroupId: string,
    actorId: string,
    actorRole: Role,
    requireManage = false,
  ) {
    const pg = await this.prisma.playgroup.findUnique({
      where: { id: playgroupId },
      include: { members: { select: { playerId: true } } },
    });
    if (!pg) throw new NotFoundException(`Playgroup ${playgroupId} not found.`);

    const canViewAll = await this.hasPermission(actorId, actorRole, Permission.VIEW_ALL);
    const canManageUsers = await this.hasPermission(actorId, actorRole, Permission.MANAGE_USERS);
    const isOwner = pg.createdById === actorId;

    if (requireManage && !isOwner && !canManageUsers) {
      throw new ForbiddenException('Only the owner or a manager can modify this playgroup.');
    }

    if (!requireManage) {
      // read access: owner OR elevated OR is a member (checked below)
      if (!isOwner && !canViewAll) {
        // Check if any Player linked to this user is in the group.
        const actorPlayers = await this.prisma.player.findMany({
          where: {
            OR: [{ userId: actorId }, { createdById: actorId }],
          },
          select: { id: true },
        });
        const actorPlayerIds = new Set(actorPlayers.map((p) => p.id));
        const memberIds = new Set(pg.members.map((m) => m.playerId));
        const actorIsMember = [...actorPlayerIds].some((pid) => memberIds.has(pid));
        if (!actorIsMember) {
          throw new ForbiddenException('You do not have access to this playgroup.');
        }
      }
    }

    return pg;
  }

  /**
   * POST /api/playgroups
   */
  async createPlaygroup(dto: CreatePlaygroupDto, actorId: string) {
    // If initial members given, verify they all exist.
    if (dto.memberPlayerIds?.length) {
      const players = await this.prisma.player.findMany({
        where: { id: { in: dto.memberPlayerIds } },
        select: { id: true },
      });
      if (players.length !== dto.memberPlayerIds.length) {
        throw new NotFoundException('One or more player IDs not found.');
      }
    }

    const pg = await this.prisma.playgroup.create({
      data: {
        name: dto.name.trim(),
        createdById: actorId,
        members: dto.memberPlayerIds?.length
          ? { create: dto.memberPlayerIds.map((pid) => ({ playerId: pid })) }
          : undefined,
      },
      include: playgroupInclude,
    });

    return formatPlaygroup(pg);
  }

  /**
   * GET /api/playgroups — caller's groups; VIEW_ALL sees everything.
   */
  async listPlaygroups(actorId: string, actorRole: Role) {
    const canViewAll = await this.hasPermission(actorId, actorRole, Permission.VIEW_ALL);

    if (canViewAll) {
      const all = await this.prisma.playgroup.findMany({
        include: playgroupInclude,
        orderBy: { createdAt: 'asc' },
      });
      return all.map(formatPlaygroup);
    }

    // Actor's Player row(s) (they may have been added to a group as a guest Player).
    const actorPlayers = await this.prisma.player.findMany({
      where: {
        OR: [{ userId: actorId }, { createdById: actorId }],
      },
      select: { id: true },
    });
    const actorPlayerIds = actorPlayers.map((p) => p.id);

    const groups = await this.prisma.playgroup.findMany({
      where: {
        OR: [{ createdById: actorId }, { members: { some: { playerId: { in: actorPlayerIds } } } }],
      },
      include: playgroupInclude,
      orderBy: { createdAt: 'asc' },
    });

    return groups.map(formatPlaygroup);
  }

  /** GET /api/playgroups/:id */
  async getPlaygroup(id: string, actorId: string, actorRole: Role) {
    await this.assertPlaygroupAccess(id, actorId, actorRole, false);
    const full = await this.prisma.playgroup.findUnique({
      where: { id },
      include: playgroupInclude,
    });
    return formatPlaygroup(full!);
  }

  /** PATCH /api/playgroups/:id */
  async renamePlaygroup(id: string, dto: RenamePlaygroupDto, actorId: string, actorRole: Role) {
    await this.assertPlaygroupAccess(id, actorId, actorRole, true);

    const updated = await this.prisma.playgroup.update({
      where: { id },
      data: { name: dto.name.trim() },
      include: playgroupInclude,
    });

    return formatPlaygroup(updated);
  }

  // ─── Membership ──────────────────────────────────────────────────────────────

  /** PUT /api/playgroups/:id/members — replace full member list. */
  async setMembers(playgroupId: string, dto: SetMembersDto, actorId: string, actorRole: Role) {
    await this.assertPlaygroupAccess(playgroupId, actorId, actorRole, true);

    // Verify all player IDs exist.
    if (dto.playerIds.length > 0) {
      const players = await this.prisma.player.findMany({
        where: { id: { in: dto.playerIds } },
        select: { id: true },
      });
      if (players.length !== dto.playerIds.length) {
        throw new NotFoundException('One or more player IDs not found.');
      }
    }

    // Replace atomically.
    await this.prisma.$transaction([
      this.prisma.playgroupMember.deleteMany({ where: { playgroupId } }),
      ...dto.playerIds.map((pid) =>
        this.prisma.playgroupMember.create({
          data: { playgroupId, playerId: pid },
        }),
      ),
    ]);

    const updated = await this.prisma.playgroup.findUnique({
      where: { id: playgroupId },
      include: playgroupInclude,
    });

    return formatPlaygroup(updated!);
  }

  /** POST /api/playgroups/:id/members/:playerId — add one member. */
  async addMember(playgroupId: string, playerId: string, actorId: string, actorRole: Role) {
    await this.assertPlaygroupAccess(playgroupId, actorId, actorRole, true);

    const player = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new NotFoundException(`Player ${playerId} not found.`);

    // Upsert — idempotent if already a member.
    await this.prisma.playgroupMember.upsert({
      where: { playgroupId_playerId: { playgroupId, playerId } },
      create: { playgroupId, playerId },
      update: {},
    });

    const updated = await this.prisma.playgroup.findUnique({
      where: { id: playgroupId },
      include: playgroupInclude,
    });

    return formatPlaygroup(updated!);
  }

  /** DELETE /api/playgroups/:id/members/:playerId — remove one member. */
  async removeMember(playgroupId: string, playerId: string, actorId: string, actorRole: Role) {
    await this.assertPlaygroupAccess(playgroupId, actorId, actorRole, true);

    const existing = await this.prisma.playgroupMember.findUnique({
      where: { playgroupId_playerId: { playgroupId, playerId } },
    });
    if (!existing) {
      throw new NotFoundException(`Player ${playerId} is not a member of this playgroup.`);
    }

    // Remove membership only — Player row is untouched (history persists).
    await this.prisma.playgroupMember.delete({
      where: { playgroupId_playerId: { playgroupId, playerId } },
    });

    const updated = await this.prisma.playgroup.findUnique({
      where: { id: playgroupId },
      include: playgroupInclude,
    });

    return formatPlaygroup(updated!);
  }
}

// ─── Shared include / formatter ──────────────────────────────────────────────

const playgroupInclude = {
  members: {
    select: {
      player: {
        select: {
          id: true,
          nickname: true,
          userId: true,
          createdById: true,
          createdAt: true,
          linkedUser: {
            select: { id: true, nickname: true, email: true },
          },
        },
      },
    },
  },
} as const;

type PlaygroupWithMembers = {
  id: string;
  name: string;
  createdById: string;
  createdAt: Date;
  members: Array<{
    player: {
      id: string;
      nickname: string;
      userId: string | null;
      createdById: string;
      createdAt: Date;
      linkedUser: { id: string; nickname: string; email: string } | null;
    };
  }>;
};

function formatPlaygroup(pg: PlaygroupWithMembers) {
  return {
    id: pg.id,
    name: pg.name,
    createdById: pg.createdById,
    createdAt: pg.createdAt,
    members: pg.members.map((m) => ({
      ...m.player,
      isGuest: m.player.userId === null,
    })),
  };
}
