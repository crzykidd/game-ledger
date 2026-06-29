/**
 * Audit service tests — verify audit entries are written for key actions.
 * Uses in-memory mock of PrismaService.
 */
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('calls prisma.auditLog.create with correct fields', async () => {
    const created: any[] = [];
    const mockPrisma = {
      auditLog: {
        create: jest.fn(async (args) => {
          created.push(args.data);
          return { id: 'fake-id', ...args.data };
        }),
      },
    };

    const svc = new AuditService(mockPrisma as any);

    await svc.write({
      actorUserId: 'actor-1',
      action: 'invite.created',
      targetType: 'token',
      targetId: 'tok-1',
      metadata: { email: 'test@test.com' },
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const entry = created[0];
    expect(entry.actorUserId).toBe('actor-1');
    expect(entry.action).toBe('invite.created');
    expect(entry.targetType).toBe('token');
    expect(entry.targetId).toBe('tok-1');
    expect(entry.metadata).toEqual({ email: 'test@test.com' });
  });

  it('uses null for missing actorUserId', async () => {
    const mockPrisma = {
      auditLog: {
        create: jest.fn(async (args) => ({ id: 'fake-id', ...args.data })),
      },
    };

    const svc = new AuditService(mockPrisma as any);

    await svc.write({ action: 'user.disabled' });

    const call = mockPrisma.auditLog.create.mock.calls[0][0];
    expect(call.data.actorUserId).toBeNull();
    expect(call.data.targetType).toBeNull();
    expect(call.data.targetId).toBeNull();
    expect(call.data.metadata).toEqual({});
  });
});
