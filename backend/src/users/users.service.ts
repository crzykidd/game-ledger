import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../rbac/permission.service';
import { AuditService } from '../audit/audit.service';
import { canActOn } from '../rbac/tier-rule';
import { Role, UserState } from '@game-ledger/contract';
import { PatchUserDto, SetUserPermissionsDto, SetUserGroupsDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly auditService: AuditService,
  ) {}

  private ensureCanActOn(actorRole: Role, targetRole: Role): void {
    if (!canActOn(actorRole, targetRole)) {
      throw new ForbiddenException(
        `Your role (${actorRole}) cannot manage accounts with role ${targetRole}.`,
      );
    }
  }

  async listUsers(includeDisabled = false, search?: string) {
    return this.prisma.user.findMany({
      where: {
        ...(includeDisabled ? {} : { NOT: { state: UserState.DISABLED } }),
        ...(search
          ? {
              OR: [
                { nickname: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { fullName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        fullName: true,
        role: true,
        state: true,
        lastLoginAt: true,
        createdAt: true,
        groups: { select: { group: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        nickname: true,
        fullName: true,
        role: true,
        state: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        permOverrides: true,
        groups: { include: { group: { include: { permissions: true } } } },
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found.`);

    const effectivePermissions = await this.permissionService.resolveEffectivePermissions(
      user.id,
      user.role as Role,
    );

    return { ...user, effectivePermissions: [...effectivePermissions] };
  }

  async patchUser(id: string, dto: PatchUserDto, actorRole: Role, actorUserId: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException(`User ${id} not found.`);

    this.ensureCanActOn(actorRole, target.role as Role);

    if (dto.role && dto.role !== target.role) {
      // Check that actor can assign the target role too.
      this.ensureCanActOn(actorRole, dto.role as Role);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.nickname ? { nickname: dto.nickname } : {}),
        ...(dto.fullName ? { fullName: dto.fullName } : {}),
      },
    });

    if (dto.role && dto.role !== target.role) {
      await this.auditService.write({
        actorUserId,
        action: 'user.role_changed',
        targetType: 'user',
        targetId: id,
        metadata: { from: target.role, to: dto.role },
      });
    }

    return updated;
  }

  async disableUser(id: string, actorRole: Role, actorUserId: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException(`User ${id} not found.`);
    if (target.state === UserState.DISABLED) {
      throw new BadRequestException('User is already disabled.');
    }
    this.ensureCanActOn(actorRole, target.role as Role);

    // Prevent disabling the sole SUPER_ADMIN.
    if (target.role === Role.SUPER_ADMIN) {
      const superAdminCount = await this.prisma.user.count({
        where: { role: Role.SUPER_ADMIN, state: { not: UserState.DISABLED } },
      });
      if (superAdminCount <= 1) {
        throw new ForbiddenException('Cannot disable the sole Super Admin.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { state: UserState.DISABLED },
    });

    // Revoke all sessions so the user is immediately logged out.
    await this.prisma.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.auditService.write({
      actorUserId,
      action: 'user.disabled',
      targetType: 'user',
      targetId: id,
    });

    return updated;
  }

  async enableUser(id: string, actorRole: Role, actorUserId: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException(`User ${id} not found.`);
    if (target.state !== UserState.DISABLED) {
      throw new BadRequestException('User is not disabled.');
    }
    this.ensureCanActOn(actorRole, target.role as Role);

    const updated = await this.prisma.user.update({
      where: { id },
      data: { state: UserState.ACTIVE },
    });

    await this.auditService.write({
      actorUserId,
      action: 'user.enabled',
      targetType: 'user',
      targetId: id,
    });

    return updated;
  }

  async setUserPermissions(
    id: string,
    dto: SetUserPermissionsDto,
    actorRole: Role,
    actorUserId: string,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException(`User ${id} not found.`);
    this.ensureCanActOn(actorRole, target.role as Role);

    // Replace all per-user overrides atomically.
    await this.prisma.$transaction([
      this.prisma.userPermissionOverride.deleteMany({ where: { userId: id } }),
      ...dto.overrides.map((o) =>
        this.prisma.userPermissionOverride.create({
          data: { userId: id, permission: o.permission, granted: o.granted },
        }),
      ),
    ]);

    await this.auditService.write({
      actorUserId,
      action: 'user.permissions_updated',
      targetType: 'user',
      targetId: id,
      metadata: { overrides: dto.overrides },
    });

    return this.getUser(id);
  }

  async setUserGroups(id: string, dto: SetUserGroupsDto, actorRole: Role, actorUserId: string) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException(`User ${id} not found.`);
    this.ensureCanActOn(actorRole, target.role as Role);

    // Verify all groups exist.
    if (dto.groupIds.length > 0) {
      const groups = await this.prisma.group.findMany({
        where: { id: { in: dto.groupIds } },
      });
      if (groups.length !== dto.groupIds.length) {
        throw new NotFoundException('One or more group IDs not found.');
      }
    }

    // Replace memberships atomically.
    await this.prisma.$transaction([
      this.prisma.userGroup.deleteMany({ where: { userId: id } }),
      ...dto.groupIds.map((groupId) =>
        this.prisma.userGroup.create({ data: { userId: id, groupId } }),
      ),
    ]);

    await this.auditService.write({
      actorUserId,
      action: 'user.groups_updated',
      targetType: 'user',
      targetId: id,
      metadata: { groupIds: dto.groupIds },
    });

    return this.getUser(id);
  }
}
