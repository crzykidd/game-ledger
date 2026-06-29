import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateGroupDto, UpdateGroupDto, SetGroupPermissionsDto } from './groups.dto';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listGroups() {
    return this.prisma.group.findMany({
      include: {
        permissions: true,
        members: {
          include: { user: { select: { id: true, nickname: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getGroup(id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        permissions: true,
        members: {
          include: { user: { select: { id: true, nickname: true } } },
        },
      },
    });
    if (!group) throw new NotFoundException(`Group ${id} not found.`);
    return group;
  }

  async createGroup(dto: CreateGroupDto, actorUserId: string) {
    const existing = await this.prisma.group.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Group with name "${dto.name}" already exists.`);

    const group = await this.prisma.group.create({
      data: { name: dto.name },
      include: { permissions: true, members: true },
    });

    await this.auditService.write({
      actorUserId,
      action: 'group.created',
      targetType: 'group',
      targetId: group.id,
      metadata: { name: group.name },
    });

    return group;
  }

  async updateGroup(id: string, dto: UpdateGroupDto, actorUserId: string) {
    await this.getGroup(id);

    if (dto.name) {
      const existing = await this.prisma.group.findUnique({ where: { name: dto.name } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Group with name "${dto.name}" already exists.`);
      }
    }

    const group = await this.prisma.group.update({
      where: { id },
      data: { name: dto.name },
      include: { permissions: true, members: true },
    });

    await this.auditService.write({
      actorUserId,
      action: 'group.updated',
      targetType: 'group',
      targetId: id,
      metadata: { changes: dto },
    });

    return group;
  }

  async deleteGroup(id: string, actorUserId: string) {
    await this.getGroup(id);
    await this.prisma.group.delete({ where: { id } });

    await this.auditService.write({
      actorUserId,
      action: 'group.deleted',
      targetType: 'group',
      targetId: id,
    });
  }

  async setGroupPermissions(id: string, dto: SetGroupPermissionsDto, actorUserId: string) {
    await this.getGroup(id);

    // Replace all permissions for this group atomically.
    await this.prisma.$transaction([
      this.prisma.groupPermission.deleteMany({ where: { groupId: id } }),
      ...dto.permissions.map((p) =>
        this.prisma.groupPermission.create({
          data: { groupId: id, permission: p.permission, granted: p.granted },
        }),
      ),
    ]);

    await this.auditService.write({
      actorUserId,
      action: 'group.permissions_updated',
      targetType: 'group',
      targetId: id,
      metadata: { permissions: dto.permissions },
    });

    return this.getGroup(id);
  }
}
