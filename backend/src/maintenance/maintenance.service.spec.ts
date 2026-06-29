/**
 * MaintenanceService unit tests.
 *
 * Uses injected ExecRunner and FsAdapter so no real pg_dump / file I/O is
 * needed. Neither 'child_process' nor 'fs' is mocked at the module level —
 * both are used internally by the Prisma client at load time, and a module-level
 * mock would break the import chain before tests can run.
 *
 * For exportAll: PrismaService is mocked via a plain object; no live DB is needed.
 */
import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MaintenanceService,
  BackupMeta,
  ExecRunner,
  FsAdapter,
  SchedulerRegistryAdapter,
} from './maintenance.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeAuditService = () => ({
  write: jest.fn().mockResolvedValue(undefined),
});

const makeConfigService = (overrides: Record<string, string> = {}) =>
  ({
    get: (key: string) =>
      overrides[key] ??
      (key === 'BACKUP_DIR'
        ? '/backups'
        : key === 'DATABASE_URL'
          ? 'postgresql://test'
          : undefined),
  }) as unknown as ConfigService;

const mockActor = { id: 'user-1' } as any;

/**
 * Build a fake FsAdapter backed by an in-memory file list.
 * Returns the adapter and a mutable files array for test setup.
 */
function makeFsAdapter(
  initialFiles: Array<{ name: string; size: number; birthtime: Date }> = [],
): {
  adapter: FsAdapter;
  files: Array<{ name: string; size: number; birthtime: Date }>;
  unlinkCalled: string[];
} {
  const files = [...initialFiles];
  const unlinkCalled: string[] = [];

  const adapter: FsAdapter = {
    existsSync: (p: string) => {
      // The backup dir itself
      if (p === '/backups') return true;
      // A specific file path
      return files.some((f) => p.endsWith('/' + f.name) || p === f.name);
    },
    mkdirSync: jest.fn(),
    readdirSync: (_dir: string) =>
      files.map((f) => ({ isFile: () => true, name: f.name })),
    statSync: (p: string) => {
      const file = files.find((f) => p.endsWith('/' + f.name) || p === f.name);
      if (file) {
        return { size: file.size, birthtime: file.birthtime, mtime: file.birthtime };
      }
      // Fallback for newly-created files (e.g., in createBackup after pg_dump writes it)
      return {
        size: 1024,
        birthtime: new Date('2026-01-01T00:00:00Z'),
        mtime: new Date('2026-01-01T00:00:00Z'),
      };
    },
    unlinkSync: (p: string) => {
      unlinkCalled.push(p);
    },
  };

  return { adapter, files, unlinkCalled };
}

/**
 * Minimal mock for PrismaService. Provide only the model finders needed for the test.
 * Uses `as unknown as PrismaService` to satisfy TypeScript without implementing the full type.
 */
function makePrismaService(
  overrides: Record<string, object> = {},
): PrismaService {
  const emptyFindMany = { findMany: jest.fn().mockResolvedValue([]) };
  const defaultSettings = {
    id: 1,
    backupEnabled: false,
    backupCron: null,
    backupRetention: 7,
    reindexEnabled: false,
    reindexCron: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  const maintenanceSetting = {
    upsert: jest.fn().mockResolvedValue(defaultSettings),
  };
  return {
    game: emptyFindMany,
    participation: emptyFindMany,
    gameEvent: emptyFindMany,
    scoreState: emptyFindMany,
    gameResult: emptyFindMany,
    player: emptyFindMany,
    playgroup: emptyFindMany,
    playgroupMember: emptyFindMany,
    gameModule: emptyFindMany,
    group: emptyFindMany,
    groupPermission: emptyFindMany,
    userGroup: emptyFindMany,
    auditLog: emptyFindMany,
    user: emptyFindMany,
    userPermissionOverride: emptyFindMany,
    maintenanceSetting,
    ...overrides,
  } as unknown as PrismaService;
}

/** Build a fake SchedulerRegistryAdapter for tests. */
function makeSchedulerAdapter(): {
  adapter: SchedulerRegistryAdapter;
  addCronJobCalls: Array<{ name: string }>;
  deleteCronJobCalls: string[];
  registeredJobs: Map<string, { stop: jest.Mock }>;
} {
  const registeredJobs = new Map<string, { stop: jest.Mock }>();
  const addCronJobCalls: Array<{ name: string }> = [];
  const deleteCronJobCalls: string[] = [];

  const adapter: SchedulerRegistryAdapter = {
    doesExist: (_type: 'cron', name: string) => registeredJobs.has(name),
    getCronJob: (name: string) => {
      const job = registeredJobs.get(name);
      if (!job) throw new Error(`No job: ${name}`);
      return job;
    },
    deleteCronJob: (name: string) => {
      registeredJobs.delete(name);
      deleteCronJobCalls.push(name);
    },
    addCronJob: (name: string, _job: object) => {
      registeredJobs.set(name, { stop: jest.fn() });
      addCronJobCalls.push({ name });
    },
  };

  return { adapter, addCronJobCalls, deleteCronJobCalls, registeredJobs };
}

/** Build a service with controllable exec runner and fs adapter. */
function makeService(opts: {
  execRunner?: ExecRunner;
  configOverrides?: Record<string, string>;
  audit?: ReturnType<typeof makeAuditService>;
  fsAdapter?: FsAdapter;
  prisma?: PrismaService;
  scheduler?: SchedulerRegistryAdapter;
}): { svc: MaintenanceService; audit: ReturnType<typeof makeAuditService> } {
  const audit = opts.audit ?? makeAuditService();
  const svc = new MaintenanceService(
    audit as unknown as AuditService,
    makeConfigService(opts.configOverrides),
    opts.prisma ?? makePrismaService(),
    opts.execRunner,
    opts.fsAdapter,
    opts.scheduler as any,
  );
  return { svc, audit };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MaintenanceService', () => {
  // ── listBackups ─────────────────────────────────────────────────────────────

  describe('listBackups', () => {
    it('returns files sorted newest-first', () => {
      const older = new Date('2026-01-01T10:00:00Z');
      const newer = new Date('2026-01-02T10:00:00Z');
      const { adapter } = makeFsAdapter([
        { name: 'gameledger-2026-01-01T10-00-00-000Z.dump', size: 100, birthtime: older },
        { name: 'gameledger-2026-01-02T10-00-00-000Z.dump', size: 200, birthtime: newer },
      ]);

      const { svc } = makeService({ fsAdapter: adapter });
      const result = svc.listBackups();

      expect(result).toHaveLength(2);
      expect(result[0].name).toContain('2026-01-02');
      expect(result[1].name).toContain('2026-01-01');
      expect(result[0].sizeBytes).toBe(200);
    });

    it('returns empty array when no dump files exist', () => {
      const { adapter } = makeFsAdapter([]);
      const { svc } = makeService({ fsAdapter: adapter });
      expect(svc.listBackups()).toEqual([]);
    });
  });

  // ── createBackup ────────────────────────────────────────────────────────────

  describe('createBackup', () => {
    it('calls pg_dump with correct args array (no shell string)', async () => {
      const execCalls: Array<{ cmd: string; args: string[] }> = [];
      const runner: ExecRunner = async (cmd, args) => {
        execCalls.push({ cmd, args });
      };
      const { adapter } = makeFsAdapter();
      const { svc } = makeService({ execRunner: runner, fsAdapter: adapter });

      const meta: BackupMeta = await svc.createBackup(mockActor);

      expect(execCalls).toHaveLength(1);
      const { cmd, args } = execCalls[0];
      expect(cmd).toBe('pg_dump');
      expect(args).toContain('-Fc');
      expect(args).toContain('-d');
      expect(args).toContain('postgresql://test');
      expect(args).toContain('-f');

      const outFile = args[args.indexOf('-f') + 1];
      expect(outFile).toMatch(/^\/backups\/gameledger-.*\.dump$/);
      expect(meta.name).toMatch(/^gameledger-.*\.dump$/);
    });

    it('audits backup.created after a successful dump', async () => {
      const runner: ExecRunner = async () => void 0;
      const { adapter } = makeFsAdapter();
      const { svc, audit } = makeService({ execRunner: runner, fsAdapter: adapter });

      await svc.createBackup(mockActor);

      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          action: 'backup.created',
          targetType: 'backup',
        }),
      );
    });

    it('passes DATABASE_URL as a discrete arg — never concatenated into the command', async () => {
      const dangerousUrl = 'postgresql://test; rm -rf /';
      const execCalls: Array<{ cmd: string; args: string[] }> = [];
      const runner: ExecRunner = async (cmd, args) => {
        execCalls.push({ cmd, args });
      };
      const { adapter } = makeFsAdapter();
      const { svc } = makeService({
        execRunner: runner,
        configOverrides: { DATABASE_URL: dangerousUrl },
        fsAdapter: adapter,
      });

      await svc.createBackup(mockActor);

      const { cmd, args } = execCalls[0];
      expect(cmd).toBe('pg_dump');
      // URL is a single element in the args array
      expect(args.includes(dangerousUrl)).toBe(true);
      // URL is NOT part of the command string itself
      expect(cmd).not.toContain(dangerousUrl);
    });

    it('calls pruneBackups using current settings after creating a backup', async () => {
      const runner: ExecRunner = async () => void 0;
      // Start with 8 files — retention is 7 (default), so the oldest 1 should be pruned
      const files = [
        { name: 'gameledger-2026-01-08T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-08T10:00:00Z') },
        { name: 'gameledger-2026-01-07T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-07T10:00:00Z') },
        { name: 'gameledger-2026-01-06T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-06T10:00:00Z') },
        { name: 'gameledger-2026-01-05T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-05T10:00:00Z') },
        { name: 'gameledger-2026-01-04T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-04T10:00:00Z') },
        { name: 'gameledger-2026-01-03T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-03T10:00:00Z') },
        { name: 'gameledger-2026-01-02T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-02T10:00:00Z') },
        { name: 'gameledger-2026-01-01T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-01T10:00:00Z') },
      ];
      const { adapter, unlinkCalled } = makeFsAdapter(files);
      // Default retention is 7
      const prisma = makePrismaService();
      const { svc } = makeService({ execRunner: runner, fsAdapter: adapter, prisma });

      await svc.createBackup(mockActor);

      // Should have pruned the oldest file (2026-01-01). The newly created file
      // plus the 8 pre-existing files = 9 total visible to listBackups, so
      // 9 - 7 = 2 should be deleted. But the newly created file is handled by
      // the fallback statSync, so listBackups returns the 8 pre-existing + 1 new = 9.
      // 9 - 7 retention = 2 oldest pruned.
      expect(unlinkCalled.length).toBeGreaterThanOrEqual(1);
      // The oldest file must be pruned
      expect(unlinkCalled.some((p) => p.includes('2026-01-01'))).toBe(true);
    });
  });

  // ── pruneBackups ────────────────────────────────────────────────────────────

  describe('pruneBackups', () => {
    it('deletes the oldest files beyond the retention limit', async () => {
      const files = [
        { name: 'gameledger-2026-01-04T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-04') },
        { name: 'gameledger-2026-01-03T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-03') },
        { name: 'gameledger-2026-01-02T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-02') },
        { name: 'gameledger-2026-01-01T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-01') },
      ];
      const { adapter, unlinkCalled } = makeFsAdapter(files);
      const { svc, audit } = makeService({ fsAdapter: adapter });

      // Keep 2 — delete the 2 oldest
      await svc.pruneBackups(2, mockActor);

      expect(unlinkCalled).toHaveLength(2);
      expect(unlinkCalled.some((p) => p.includes('2026-01-01'))).toBe(true);
      expect(unlinkCalled.some((p) => p.includes('2026-01-02'))).toBe(true);
      expect(unlinkCalled.some((p) => p.includes('2026-01-03'))).toBe(false);
      expect(unlinkCalled.some((p) => p.includes('2026-01-04'))).toBe(false);

      // Audit each deletion
      const deleteCalls = (audit.write as jest.Mock).mock.calls.filter(
        (c: any[]) => c[0].action === 'backup.deleted',
      );
      expect(deleteCalls).toHaveLength(2);
    });

    it('keeps all backups when retention is 0', async () => {
      const files = [
        { name: 'gameledger-2026-01-02T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-02') },
        { name: 'gameledger-2026-01-01T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-01') },
      ];
      const { adapter, unlinkCalled } = makeFsAdapter(files);
      const { svc } = makeService({ fsAdapter: adapter });

      await svc.pruneBackups(0, mockActor);

      expect(unlinkCalled).toHaveLength(0);
    });

    it('is a no-op when the number of backups is within the retention limit', async () => {
      const files = [
        { name: 'gameledger-2026-01-02T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-02') },
        { name: 'gameledger-2026-01-01T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-01') },
      ];
      const { adapter, unlinkCalled } = makeFsAdapter(files);
      const { svc } = makeService({ fsAdapter: adapter });

      await svc.pruneBackups(5, mockActor);

      expect(unlinkCalled).toHaveLength(0);
    });

    it('audits each deletion with backup.deleted', async () => {
      const files = [
        { name: 'gameledger-2026-01-03T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-03') },
        { name: 'gameledger-2026-01-02T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-02') },
        { name: 'gameledger-2026-01-01T10-00-00-000Z.dump', size: 100, birthtime: new Date('2026-01-01') },
      ];
      const { adapter } = makeFsAdapter(files);
      const { svc, audit } = makeService({ fsAdapter: adapter });

      await svc.pruneBackups(1, mockActor);

      const deleteCalls = (audit.write as jest.Mock).mock.calls.filter(
        (c: any[]) => c[0].action === 'backup.deleted',
      );
      expect(deleteCalls).toHaveLength(2);
      expect(deleteCalls[0][0]).toMatchObject({
        action: 'backup.deleted',
        targetType: 'backup',
        metadata: expect.objectContaining({ reason: 'retention_pruning' }),
      });
    });
  });

  // ── getSettings ──────────────────────────────────────────────────────────────

  describe('getSettings', () => {
    it('returns defaults when no row exists', async () => {
      const { svc } = makeService({});
      const settings = await svc.getSettings();
      expect(settings.backupEnabled).toBe(false);
      expect(settings.backupRetention).toBe(7);
      expect(settings.backupCron).toBeNull();
      expect(settings.reindexEnabled).toBe(false);
      expect(settings.reindexCron).toBeNull();
      expect(settings.createdAt).toBeDefined();
      expect(settings.updatedAt).toBeDefined();
    });
  });

  // ── updateSettings ───────────────────────────────────────────────────────────

  describe('updateSettings', () => {
    it('persists valid settings and audits maintenance.settings_updated', async () => {
      const updatedRow = {
        id: 1,
        backupEnabled: true,
        backupCron: '0 3 * * *',
        backupRetention: 14,
        reindexEnabled: false,
        reindexCron: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T01:00:00Z'),
      };
      const prisma = makePrismaService({
        maintenanceSetting: {
          upsert: jest.fn().mockResolvedValue(updatedRow),
        },
      });
      const { adapter } = makeFsAdapter();
      const { svc, audit } = makeService({ prisma, fsAdapter: adapter });

      const result = await svc.updateSettings(
        { backupEnabled: true, backupCron: '0 3 * * *', backupRetention: 14 },
        mockActor,
      );

      expect(result.backupEnabled).toBe(true);
      expect(result.backupCron).toBe('0 3 * * *');
      expect(result.backupRetention).toBe(14);

      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          action: 'maintenance.settings_updated',
          targetType: 'maintenance_settings',
        }),
      );
    });

    it('rejects an invalid cron expression with BadRequestException', async () => {
      const { svc } = makeService({});

      await expect(
        svc.updateSettings({ backupCron: 'not-a-cron' }, mockActor),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a valid cron expression', async () => {
      const prisma = makePrismaService();
      const { svc } = makeService({ prisma });

      // Should not throw
      await expect(
        svc.updateSettings({ backupCron: '0 2 * * 0' }, mockActor),
      ).resolves.toBeDefined();
    });

    it('calls syncSchedules after updating', async () => {
      const { adapter: schedAdapter, addCronJobCalls } = makeSchedulerAdapter();
      const updatedRow = {
        id: 1,
        backupEnabled: true,
        backupCron: '0 4 * * *',
        backupRetention: 7,
        reindexEnabled: false,
        reindexCron: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const prisma = makePrismaService({
        maintenanceSetting: {
          upsert: jest.fn().mockResolvedValue(updatedRow),
        },
      });
      const { svc } = makeService({ prisma, scheduler: schedAdapter });

      await svc.updateSettings({ backupEnabled: true, backupCron: '0 4 * * *' }, mockActor);

      expect(addCronJobCalls.some((c) => c.name === 'maintenance.backup')).toBe(true);
    });
  });

  // ── syncSchedules ─────────────────────────────────────────────────────────────

  describe('syncSchedules', () => {
    it('registers a backup job when backupEnabled and backupCron are set', () => {
      const { adapter: schedAdapter, addCronJobCalls } = makeSchedulerAdapter();
      const { svc } = makeService({ scheduler: schedAdapter });

      svc.syncSchedules({
        backupEnabled: true,
        backupCron: '0 3 * * *',
        backupRetention: 7,
        reindexEnabled: false,
        reindexCron: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(addCronJobCalls).toHaveLength(1);
      expect(addCronJobCalls[0].name).toBe('maintenance.backup');
    });

    it('does not register a job when backupEnabled is false', () => {
      const { adapter: schedAdapter, addCronJobCalls } = makeSchedulerAdapter();
      const { svc } = makeService({ scheduler: schedAdapter });

      svc.syncSchedules({
        backupEnabled: false,
        backupCron: '0 3 * * *',
        backupRetention: 7,
        reindexEnabled: false,
        reindexCron: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(addCronJobCalls).toHaveLength(0);
    });

    it('does not register a job when backupCron is null', () => {
      const { adapter: schedAdapter, addCronJobCalls } = makeSchedulerAdapter();
      const { svc } = makeService({ scheduler: schedAdapter });

      svc.syncSchedules({
        backupEnabled: true,
        backupCron: null,
        backupRetention: 7,
        reindexEnabled: false,
        reindexCron: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(addCronJobCalls).toHaveLength(0);
    });

    it('removes an existing job before re-registering', () => {
      const { adapter: schedAdapter, addCronJobCalls, deleteCronJobCalls, registeredJobs } =
        makeSchedulerAdapter();
      // Pre-populate an existing job
      const fakeJob = { stop: jest.fn() };
      registeredJobs.set('maintenance.backup', fakeJob);

      const { svc } = makeService({ scheduler: schedAdapter });

      svc.syncSchedules({
        backupEnabled: true,
        backupCron: '0 3 * * *',
        backupRetention: 7,
        reindexEnabled: false,
        reindexCron: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(fakeJob.stop).toHaveBeenCalled();
      expect(deleteCronJobCalls).toContain('maintenance.backup');
      expect(addCronJobCalls).toHaveLength(1);
    });

    it('skips job registration and does not throw when cron expression is malformed', () => {
      const { adapter: schedAdapter, addCronJobCalls } = makeSchedulerAdapter();
      const { svc } = makeService({ scheduler: schedAdapter });

      // A malformed stored cron must not crash boot.
      expect(() =>
        svc.syncSchedules({
          backupEnabled: true,
          backupCron: 'not-valid-cron',
          backupRetention: 7,
          reindexEnabled: false,
          reindexCron: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ).not.toThrow();

      expect(addCronJobCalls).toHaveLength(0);
    });
  });

  // ── getBackupPath ────────────────────────────────────────────────────────────

  describe('getBackupPath', () => {
    const validFile = { name: 'gameledger-2026-01-01T10-00-00-000Z.dump', size: 100, birthtime: new Date() };

    it('accepts a valid backup name', () => {
      const { adapter } = makeFsAdapter([validFile]);
      const { svc } = makeService({ fsAdapter: adapter });
      const p = svc.getBackupPath('gameledger-2026-01-01T10-00-00-000Z.dump');
      expect(p).toBe('/backups/gameledger-2026-01-01T10-00-00-000Z.dump');
    });

    it('rejects a path traversal attempt (../etc/passwd)', () => {
      const { adapter } = makeFsAdapter([validFile]);
      const { svc } = makeService({ fsAdapter: adapter });
      expect(() => svc.getBackupPath('../etc/passwd')).toThrow(NotFoundException);
    });

    it('rejects a name without the gameledger- prefix', () => {
      const { adapter } = makeFsAdapter([validFile]);
      const { svc } = makeService({ fsAdapter: adapter });
      expect(() => svc.getBackupPath('foo.txt')).toThrow(NotFoundException);
    });

    it('rejects a name that does not end in .dump', () => {
      const { adapter } = makeFsAdapter([validFile]);
      const { svc } = makeService({ fsAdapter: adapter });
      expect(() => svc.getBackupPath('gameledger-2026-01-01T10-00-00-000Z.sql')).toThrow(
        NotFoundException,
      );
    });

    it('rejects an empty string', () => {
      const { adapter } = makeFsAdapter([validFile]);
      const { svc } = makeService({ fsAdapter: adapter });
      expect(() => svc.getBackupPath('')).toThrow(NotFoundException);
    });

    it('throws NotFoundException when the file does not exist', () => {
      const { adapter } = makeFsAdapter([]); // no files
      const { svc } = makeService({ fsAdapter: adapter });
      expect(() => svc.getBackupPath('gameledger-2026-01-01T10-00-00-000Z.dump')).toThrow(
        NotFoundException,
      );
    });
  });

  // ── deleteBackup ─────────────────────────────────────────────────────────────

  describe('deleteBackup', () => {
    it('unlinks the file and audits backup.deleted', async () => {
      const { adapter, unlinkCalled } = makeFsAdapter([
        { name: 'gameledger-2026-01-01T10-00-00-000Z.dump', size: 100, birthtime: new Date() },
      ]);
      const { svc, audit } = makeService({ fsAdapter: adapter });

      await svc.deleteBackup('gameledger-2026-01-01T10-00-00-000Z.dump', mockActor);

      expect(unlinkCalled).toContain('/backups/gameledger-2026-01-01T10-00-00-000Z.dump');
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'backup.deleted',
          actorUserId: 'user-1',
        }),
      );
    });

    it('rejects an invalid name with NotFoundException', async () => {
      const { adapter } = makeFsAdapter([]);
      const { svc } = makeService({ fsAdapter: adapter });
      await expect(svc.deleteBackup('../evil', mockActor)).rejects.toThrow(NotFoundException);
    });
  });

  // ── restoreFromStored ─────────────────────────────────────────────────────────

  describe('restoreFromStored', () => {
    it('calls pg_restore with correct args and audits backup.restored', async () => {
      const execCalls: Array<{ cmd: string; args: string[] }> = [];
      const runner: ExecRunner = async (cmd, args) => {
        execCalls.push({ cmd, args });
      };
      const { adapter } = makeFsAdapter([
        { name: 'gameledger-2026-01-01T10-00-00-000Z.dump', size: 100, birthtime: new Date() },
      ]);
      const { svc, audit } = makeService({ execRunner: runner, fsAdapter: adapter });

      await svc.restoreFromStored('gameledger-2026-01-01T10-00-00-000Z.dump', mockActor);

      expect(execCalls).toHaveLength(1);
      const { cmd, args } = execCalls[0];
      expect(cmd).toBe('pg_restore');
      expect(args).toContain('--clean');
      expect(args).toContain('--if-exists');
      expect(args).toContain('--no-owner');
      expect(args).toContain('--no-acl');
      expect(args).toContain('-d');
      expect(args).toContain('postgresql://test');

      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'backup.restored',
          actorUserId: 'user-1',
        }),
      );
    });
  });

  // ── restoreFromUpload ────────────────────────────────────────────────────────

  describe('restoreFromUpload', () => {
    it('cleans up the temp file after a successful restore', async () => {
      const runner: ExecRunner = async () => void 0;
      const { adapter, unlinkCalled } = makeFsAdapter([]);
      const { svc } = makeService({ execRunner: runner, fsAdapter: adapter });

      await svc.restoreFromUpload('/tmp/restore-upload-12345.dump', mockActor);

      expect(unlinkCalled).toContain('/tmp/restore-upload-12345.dump');
    });

    it('cleans up the temp file even if pg_restore fails', async () => {
      const runner: ExecRunner = async () => {
        throw new Error('pg_restore failed');
      };
      const { adapter, unlinkCalled } = makeFsAdapter([]);
      const { svc } = makeService({ execRunner: runner, fsAdapter: adapter });

      await expect(
        svc.restoreFromUpload('/tmp/restore-upload-99999.dump', mockActor),
      ).rejects.toThrow('pg_restore failed');

      expect(unlinkCalled).toContain('/tmp/restore-upload-99999.dump');
    });
  });

  // ── exportAll ────────────────────────────────────────────────────────────────

  describe('exportAll', () => {
    it('returns a snapshot with all expected table keys', async () => {
      const { svc } = makeService({});
      const snapshot = await svc.exportAll(mockActor);

      expect(snapshot).toHaveProperty('exportedAt');
      expect(snapshot).toHaveProperty('version', '1');
      expect(snapshot.tables).toHaveProperty('games');
      expect(snapshot.tables).toHaveProperty('participations');
      expect(snapshot.tables).toHaveProperty('game_events');
      expect(snapshot.tables).toHaveProperty('score_states');
      expect(snapshot.tables).toHaveProperty('game_results');
      expect(snapshot.tables).toHaveProperty('players');
      expect(snapshot.tables).toHaveProperty('playgroups');
      expect(snapshot.tables).toHaveProperty('playgroup_members');
      expect(snapshot.tables).toHaveProperty('game_modules');
      expect(snapshot.tables).toHaveProperty('groups');
      expect(snapshot.tables).toHaveProperty('group_permissions');
      expect(snapshot.tables).toHaveProperty('user_groups');
      expect(snapshot.tables).toHaveProperty('audit_logs');
      expect(snapshot.tables).toHaveProperty('users');
      expect(snapshot.tables).toHaveProperty('user_permission_overrides');
    });

    it('omits passwordHash from User rows', async () => {
      const prisma = makePrismaService({
        user: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'u1',
              email: 'alice@example.com',
              passwordHash: '$argon2id$SUPER_SECRET',
              fullName: 'Alice',
              nickname: 'alice',
              role: 'PLAYER',
              state: 'ACTIVE',
              themePref: 'SYSTEM',
              createdAt: new Date(),
              updatedAt: new Date(),
              lastLoginAt: null,
              failedLoginAttempts: 0,
              lockedUntil: null,
            },
          ]),
        },
      });
      const { svc } = makeService({ prisma });
      const snapshot = await svc.exportAll(mockActor);

      const users = snapshot.tables['users'] as Array<Record<string, unknown>>;
      expect(users).toHaveLength(1);
      expect(users[0]).not.toHaveProperty('passwordHash');
      // Non-secret fields ARE present
      expect(users[0]).toHaveProperty('email', 'alice@example.com');
      expect(users[0]).toHaveProperty('nickname', 'alice');
    });

    it('omits failedLoginAttempts and lockedUntil from User rows', async () => {
      const prisma = makePrismaService({
        user: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'u2',
              email: 'bob@example.com',
              passwordHash: 'hash',
              fullName: 'Bob',
              nickname: 'bob',
              role: 'ADMIN',
              state: 'ACTIVE',
              themePref: 'DARK',
              createdAt: new Date(),
              updatedAt: new Date(),
              lastLoginAt: null,
              failedLoginAttempts: 3,
              lockedUntil: new Date(),
            },
          ]),
        },
      });
      const { svc } = makeService({ prisma });
      const snapshot = await svc.exportAll(mockActor);

      const users = snapshot.tables['users'] as Array<Record<string, unknown>>;
      expect(users[0]).not.toHaveProperty('passwordHash');
      expect(users[0]).not.toHaveProperty('failedLoginAttempts');
      expect(users[0]).not.toHaveProperty('lockedUntil');
    });

    it('excludes Session and Token tables entirely', async () => {
      const { svc } = makeService({});
      const snapshot = await svc.exportAll(mockActor);

      expect(snapshot.tables).not.toHaveProperty('sessions');
      expect(snapshot.tables).not.toHaveProperty('tokens');
    });

    it('serializes BigInt GameEvent.id to string without throwing', async () => {
      const bigIntId = BigInt('9007199254740993'); // > Number.MAX_SAFE_INTEGER
      const prisma = makePrismaService({
        gameEvent: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: bigIntId,
              gameId: 'game-1',
              seq: 1,
              authorPlayerId: null,
              type: 'round_score',
              payload: { scores: {} },
              clientEventId: 'client-abc',
              createdAt: new Date(),
            },
          ]),
        },
      });
      const { svc } = makeService({ prisma });
      const snapshot = await svc.exportAll(mockActor);

      // JSON.stringify with the replacer must not throw
      let json: string;
      expect(() => {
        json = JSON.stringify(snapshot, MaintenanceService.jsonReplacer);
      }).not.toThrow();

      const parsed = JSON.parse(json!) as {
        tables: { game_events: Array<{ id: string }> };
      };
      expect(parsed.tables.game_events[0].id).toBe('9007199254740993');
      expect(typeof parsed.tables.game_events[0].id).toBe('string');
    });

    it('serializes Decimal GameResult.score to string without precision loss', async () => {
      // Prisma Decimal objects have a .toString() method.
      const decimalScore = { toString: () => '1234.5678' };
      const prisma = makePrismaService({
        gameResult: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'gr-1',
              gameId: 'game-1',
              participationId: 'part-1',
              rank: 1,
              didWin: true,
              score: decimalScore,
              normalized: {},
            },
          ]),
        },
      });
      const { svc } = makeService({ prisma });
      const snapshot = await svc.exportAll(mockActor);

      const results = snapshot.tables['game_results'] as Array<{
        score: string | null;
      }>;
      expect(results[0].score).toBe('1234.5678');
      // Must serialize cleanly
      expect(() => JSON.stringify(snapshot, MaintenanceService.jsonReplacer)).not.toThrow();
    });

    it('handles null GameResult.score correctly', async () => {
      const prisma = makePrismaService({
        gameResult: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'gr-2',
              gameId: 'game-2',
              participationId: 'part-2',
              rank: 1,
              didWin: true,
              score: null,
              normalized: {},
            },
          ]),
        },
      });
      const { svc } = makeService({ prisma });
      const snapshot = await svc.exportAll(mockActor);

      const results = snapshot.tables['game_results'] as Array<{
        score: string | null;
      }>;
      expect(results[0].score).toBeNull();
    });

    it('audits export.generated with rowCounts metadata', async () => {
      const audit = makeAuditService();
      const { svc } = makeService({ audit });
      await svc.exportAll(mockActor);

      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          action: 'export.generated',
          targetType: 'export',
          metadata: expect.objectContaining({ rowCounts: expect.any(Object) }),
        }),
      );
    });

    it('jsonReplacer converts bigint to string and passes other values through', () => {
      expect(MaintenanceService.jsonReplacer('id', BigInt(42))).toBe('42');
      expect(MaintenanceService.jsonReplacer('name', 'alice')).toBe('alice');
      expect(MaintenanceService.jsonReplacer('count', 5)).toBe(5);
      expect(MaintenanceService.jsonReplacer('flag', true)).toBe(true);
      expect(MaintenanceService.jsonReplacer('missing', null)).toBeNull();
    });
  });

  // ── runMaintenance ───────────────────────────────────────────────────────────

  describe('runMaintenance', () => {
    it('calls psql with -c "VACUUM (ANALYZE);" for kind=vacuum', async () => {
      const execCalls: Array<{ cmd: string; args: string[] }> = [];
      const runner: ExecRunner = async (cmd, args) => {
        execCalls.push({ cmd, args });
      };
      const { svc } = makeService({ execRunner: runner });

      await svc.runMaintenance('vacuum', mockActor);

      expect(execCalls).toHaveLength(1);
      const { cmd, args } = execCalls[0];
      expect(cmd).toBe('psql');
      expect(args).toContain('-d');
      expect(args).toContain('postgresql://test');
      expect(args).toContain('-c');
      expect(args).toContain('VACUUM (ANALYZE);');
    });

    it('calls psql with -c "REINDEX DATABASE gameledger;" for kind=reindex', async () => {
      const execCalls: Array<{ cmd: string; args: string[] }> = [];
      const runner: ExecRunner = async (cmd, args) => {
        execCalls.push({ cmd, args });
      };
      const { svc } = makeService({ execRunner: runner });

      await svc.runMaintenance('reindex', mockActor);

      expect(execCalls).toHaveLength(1);
      const { cmd, args } = execCalls[0];
      expect(cmd).toBe('psql');
      expect(args).toContain('-d');
      expect(args).toContain('postgresql://test');
      expect(args).toContain('-c');
      expect(args).toContain('REINDEX DATABASE gameledger;');
    });

    it('passes DATABASE_URL as a discrete arg — never interpolated into the command', async () => {
      const dangerousUrl = 'postgresql://test; rm -rf /';
      const execCalls: Array<{ cmd: string; args: string[] }> = [];
      const runner: ExecRunner = async (cmd, args) => {
        execCalls.push({ cmd, args });
      };
      const { svc } = makeService({
        execRunner: runner,
        configOverrides: { DATABASE_URL: dangerousUrl },
      });

      await svc.runMaintenance('vacuum', mockActor);

      const { cmd, args } = execCalls[0];
      expect(cmd).toBe('psql');
      expect(args.includes(dangerousUrl)).toBe(true);
      expect(cmd).not.toContain(dangerousUrl);
    });

    it('audits maintenance.reindex for both vacuum and reindex kinds', async () => {
      const runner: ExecRunner = async () => void 0;
      const audit = makeAuditService();
      const { svc } = makeService({ execRunner: runner, audit });

      await svc.runMaintenance('vacuum', mockActor);
      await svc.runMaintenance('reindex', mockActor);

      const calls = (audit.write as jest.Mock).mock.calls.filter(
        (c: any[]) => c[0].action === 'maintenance.reindex',
      );
      expect(calls).toHaveLength(2);
      expect(calls[0][0]).toMatchObject({
        actorUserId: 'user-1',
        action: 'maintenance.reindex',
        targetType: 'database',
        metadata: expect.objectContaining({ kind: 'vacuum' }),
      });
      expect(calls[1][0]).toMatchObject({
        actorUserId: 'user-1',
        action: 'maintenance.reindex',
        metadata: expect.objectContaining({ kind: 'reindex' }),
      });
    });

    it('returns kind, durationMs, and completedAt on success', async () => {
      const runner: ExecRunner = async () => void 0;
      const { svc } = makeService({ execRunner: runner });

      const result = await svc.runMaintenance('vacuum', mockActor);

      expect(result.kind).toBe('vacuum');
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.completedAt).toBe('string');
      expect(new Date(result.completedAt).toISOString()).toBe(result.completedAt);
    });

    it('throws InternalServerErrorException when psql exits non-zero', async () => {
      const runner: ExecRunner = async () => {
        throw new Error('psql: FATAL: database "gameledger" does not exist');
      };
      const { svc } = makeService({ execRunner: runner });

      await expect(svc.runMaintenance('reindex', mockActor)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('includes the psql error message in the thrown exception', async () => {
      const runner: ExecRunner = async () => {
        throw new Error('psql: connection refused');
      };
      const { svc } = makeService({ execRunner: runner });

      let caught: unknown;
      try {
        await svc.runMaintenance('vacuum', mockActor);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(InternalServerErrorException);
      const ex = caught as InternalServerErrorException;
      expect(ex.message).toContain('psql: connection refused');
    });
  });

  // ── syncSchedules (reindex job) ──────────────────────────────────────────────

  describe('syncSchedules — reindex job', () => {
    it('registers a reindex job when reindexEnabled and reindexCron are set', () => {
      const { adapter: schedAdapter, addCronJobCalls } = makeSchedulerAdapter();
      const { svc } = makeService({ scheduler: schedAdapter });

      svc.syncSchedules({
        backupEnabled: false,
        backupCron: null,
        backupRetention: 7,
        reindexEnabled: true,
        reindexCron: '0 4 * * 0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(addCronJobCalls.some((c) => c.name === 'maintenance.reindex')).toBe(true);
    });

    it('does not register a reindex job when reindexEnabled is false', () => {
      const { adapter: schedAdapter, addCronJobCalls } = makeSchedulerAdapter();
      const { svc } = makeService({ scheduler: schedAdapter });

      svc.syncSchedules({
        backupEnabled: false,
        backupCron: null,
        backupRetention: 7,
        reindexEnabled: false,
        reindexCron: '0 4 * * 0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(addCronJobCalls.some((c) => c.name === 'maintenance.reindex')).toBe(false);
    });

    it('does not register a reindex job when reindexCron is null', () => {
      const { adapter: schedAdapter, addCronJobCalls } = makeSchedulerAdapter();
      const { svc } = makeService({ scheduler: schedAdapter });

      svc.syncSchedules({
        backupEnabled: false,
        backupCron: null,
        backupRetention: 7,
        reindexEnabled: true,
        reindexCron: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(addCronJobCalls.some((c) => c.name === 'maintenance.reindex')).toBe(false);
    });

    it('backup job and reindex job register independently when both enabled', () => {
      const { adapter: schedAdapter, addCronJobCalls } = makeSchedulerAdapter();
      const { svc } = makeService({ scheduler: schedAdapter });

      svc.syncSchedules({
        backupEnabled: true,
        backupCron: '0 3 * * *',
        backupRetention: 7,
        reindexEnabled: true,
        reindexCron: '0 4 * * 0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(addCronJobCalls.some((c) => c.name === 'maintenance.backup')).toBe(true);
      expect(addCronJobCalls.some((c) => c.name === 'maintenance.reindex')).toBe(true);
      expect(addCronJobCalls).toHaveLength(2);
    });

    it('removes an existing reindex job before re-registering', () => {
      const { adapter: schedAdapter, addCronJobCalls, deleteCronJobCalls, registeredJobs } =
        makeSchedulerAdapter();
      // Pre-populate an existing reindex job
      const fakeJob = { stop: jest.fn() };
      registeredJobs.set('maintenance.reindex', fakeJob);

      const { svc } = makeService({ scheduler: schedAdapter });

      svc.syncSchedules({
        backupEnabled: false,
        backupCron: null,
        backupRetention: 7,
        reindexEnabled: true,
        reindexCron: '0 4 * * 0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(fakeJob.stop).toHaveBeenCalled();
      expect(deleteCronJobCalls).toContain('maintenance.reindex');
      expect(addCronJobCalls.some((c) => c.name === 'maintenance.reindex')).toBe(true);
    });

    it('skips reindex job registration and does not throw when cron expression is malformed', () => {
      const { adapter: schedAdapter, addCronJobCalls } = makeSchedulerAdapter();
      const { svc } = makeService({ scheduler: schedAdapter });

      // A malformed stored cron must not crash boot.
      expect(() =>
        svc.syncSchedules({
          backupEnabled: false,
          backupCron: null,
          backupRetention: 7,
          reindexEnabled: true,
          reindexCron: 'not-valid-cron',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ).not.toThrow();

      expect(addCronJobCalls.some((c) => c.name === 'maintenance.reindex')).toBe(false);
    });
  });
});
