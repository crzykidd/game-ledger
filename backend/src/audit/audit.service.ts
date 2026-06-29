import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'invite.created'
  | 'invite.consumed'
  | 'invite.revoked'
  | 'invite.regenerated'
  | 'reset.issued'
  | 'reset.consumed'
  | 'user.disabled'
  | 'user.enabled'
  | 'user.role_changed'
  | 'user.permissions_updated'
  | 'user.groups_updated'
  | 'group.created'
  | 'group.updated'
  | 'group.deleted'
  | 'group.permissions_updated'
  | 'backup.created'
  | 'backup.deleted'
  | 'backup.restored'
  | 'export.generated'
  | 'maintenance.settings_updated'
  | 'maintenance.reindex';

export interface WriteAuditParams {
  actorUserId?: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async write(params: WriteAuditParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId ?? null,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        // Prisma Json field requires explicit cast for Record types.
        metadata: (params.metadata ?? {}) as object,
      },
    });
  }

  async findRecent(limit = 100) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        actor: {
          select: { id: true, nickname: true, email: true },
        },
      },
    });
  }
}
