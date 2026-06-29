import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import {
  UpdateMaintenanceSettingsDto,
  validateCronExpression,
} from './update-maintenance-settings.dto';
import { MaintenanceKind, MaintenanceSettings } from '@game-ledger/contract';

const execFileAsync = promisify(execFile);

/** Strict allowlist for backup file names — guards against path traversal. */
const BACKUP_NAME_RE = /^gameledger-[\dTZ:\-]+\.dump$/;

/** Name used to identify the scheduled backup cron job in SchedulerRegistry. */
const BACKUP_JOB_NAME = 'maintenance.backup';

/** Name used to identify the scheduled reindex cron job in SchedulerRegistry. */
const REINDEX_JOB_NAME = 'maintenance.reindex';

/**
 * The psql SQL command run for each maintenance kind.
 * VACUUM (ANALYZE) and REINDEX cannot run inside a transaction block — they
 * must be issued via psql (not Prisma's $executeRaw, which wraps in a transaction).
 */
const MAINTENANCE_SQL: Record<MaintenanceKind, string> = {
  vacuum: 'VACUUM (ANALYZE);',
  reindex: 'REINDEX DATABASE gameledger;',
};

/** Shape of the result returned by runMaintenance. */
export interface MaintenanceResult {
  kind: MaintenanceKind;
  durationMs: number;
  completedAt: string;
}

/** Sentinel actor used for audit entries written by scheduled (system) runs. */
const SYSTEM_ACTOR_ID: string | undefined = undefined;

export interface BackupMeta {
  name: string;
  sizeBytes: number;
  createdAt: Date;
}

/**
 * Injectable runner for shell commands. Wraps execFile (args array, no shell
 * expansion) to allow tests to inject a mock without touching the child_process
 * module itself (which Prisma client uses at load time).
 */
export type ExecRunner = (cmd: string, args: string[]) => Promise<void>;

/**
 * Injectable filesystem abstraction to allow tests to mock file I/O without
 * mocking the entire 'fs' module (which Prisma client also uses at load time).
 */
export interface FsAdapter {
  existsSync(p: string): boolean;
  mkdirSync(p: string, opts?: { recursive?: boolean }): void;
  readdirSync(dir: string): Array<{ isFile(): boolean; name: string }>;
  statSync(p: string): { size: number; birthtime: Date; mtime: Date };
  unlinkSync(p: string): void;
}

/**
 * Shape of the JSON export produced by exportAll.
 * `tables` keys are snake_case table names; values are arrays of sanitized row objects.
 */
export interface ExportSnapshot {
  exportedAt: string;
  /** Semantic version of this export format (bumped when the shape changes). */
  version: string;
  tables: Record<string, unknown[]>;
}

/**
 * Minimal SchedulerRegistry interface so tests can inject a fake without
 * pulling in the full @nestjs/schedule module.
 */
export interface SchedulerRegistryAdapter {
  doesExist(type: 'cron', name: string): boolean;
  getCronJob(name: string): { stop(): void };
  deleteCronJob(name: string): void;
  addCronJob(name: string, job: CronJob): void;
}

const defaultExecRunner: ExecRunner = (cmd, args) => execFileAsync(cmd, args).then(() => void 0);

const defaultFsAdapter: FsAdapter = {
  existsSync: fs.existsSync,
  mkdirSync: (p, opts) => fs.mkdirSync(p, opts),
  readdirSync: (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }) as Array<{ isFile(): boolean; name: string }>,
  statSync: (p) => {
    const s = fs.statSync(p);
    return { size: s.size, birthtime: s.birthtime, mtime: s.mtime };
  },
  unlinkSync: fs.unlinkSync,
};

@Injectable()
export class MaintenanceService implements OnModuleInit {
  private readonly logger = new Logger(MaintenanceService.name);
  private readonly backupDir: string;
  private readonly databaseUrl: string;
  private readonly exec: ExecRunner;
  private readonly fsAdapter: FsAdapter;
  private readonly schedulerAdapter: SchedulerRegistryAdapter;

  constructor(
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() execRunner?: ExecRunner,
    @Optional() fsAdapter?: FsAdapter,
    @Optional()
    @Inject(SchedulerRegistry)
    schedulerRegistry?: SchedulerRegistry | SchedulerRegistryAdapter,
  ) {
    this.backupDir = this.config.get<string>('BACKUP_DIR') ?? '/backups';
    this.databaseUrl = this.config.get<string>('DATABASE_URL') ?? process.env.DATABASE_URL ?? '';
    this.exec = execRunner ?? defaultExecRunner;
    this.fsAdapter = fsAdapter ?? defaultFsAdapter;
    this.schedulerAdapter = (schedulerRegistry as SchedulerRegistryAdapter) ?? {
      doesExist: () => false,
      getCronJob: () => {
        throw new Error('no job');
      },
      deleteCronJob: () => {},
      addCronJob: () => {},
    };
  }

  // ─── Module init ─────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    try {
      const settings = await this.getSettings();
      this.syncSchedules(settings);
    } catch (err) {
      // Never crash boot due to scheduler setup failure.
      this.logger.error('Failed to sync maintenance schedules on init', err);
    }
  }

  // ─── Settings ────────────────────────────────────────────────────────────────

  /** Read the singleton settings row, creating it with defaults if absent. */
  async getSettings(): Promise<MaintenanceSettings> {
    const row = await this.prisma.maintenanceSetting.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    return this.toSettings(row);
  }

  /**
   * Update settings, validate cron strings, audit the change, then re-sync
   * the scheduler. Returns the updated settings.
   */
  async updateSettings(
    dto: UpdateMaintenanceSettingsDto,
    actor: User,
  ): Promise<MaintenanceSettings> {
    // Validate cron strings before persisting.
    if (dto.backupCron != null) {
      validateCronExpression(dto.backupCron);
    }
    if (dto.reindexCron != null) {
      validateCronExpression(dto.reindexCron);
    }

    const row = await this.prisma.maintenanceSetting.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        ...(dto.backupEnabled !== undefined && { backupEnabled: dto.backupEnabled }),
        ...(dto.backupCron !== undefined && { backupCron: dto.backupCron }),
        ...(dto.backupRetention !== undefined && { backupRetention: dto.backupRetention }),
        ...(dto.reindexEnabled !== undefined && { reindexEnabled: dto.reindexEnabled }),
        ...(dto.reindexCron !== undefined && { reindexCron: dto.reindexCron }),
      },
      update: {
        ...(dto.backupEnabled !== undefined && { backupEnabled: dto.backupEnabled }),
        ...(dto.backupCron !== undefined && { backupCron: dto.backupCron }),
        ...(dto.backupRetention !== undefined && { backupRetention: dto.backupRetention }),
        ...(dto.reindexEnabled !== undefined && { reindexEnabled: dto.reindexEnabled }),
        ...(dto.reindexCron !== undefined && { reindexCron: dto.reindexCron }),
      },
    });

    await this.auditService.write({
      actorUserId: actor.id,
      action: 'maintenance.settings_updated',
      targetType: 'maintenance_settings',
      targetId: '1',
      metadata: { changes: dto },
    });

    const settings = this.toSettings(row);
    this.syncSchedules(settings);
    return settings;
  }

  private toSettings(row: {
    backupEnabled: boolean;
    backupCron: string | null;
    backupRetention: number;
    reindexEnabled: boolean;
    reindexCron: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): MaintenanceSettings {
    return {
      backupEnabled: row.backupEnabled,
      backupCron: row.backupCron,
      backupRetention: row.backupRetention,
      reindexEnabled: row.reindexEnabled,
      reindexCron: row.reindexCron,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  // ─── Scheduling ──────────────────────────────────────────────────────────────

  /**
   * Remove existing maintenance cron jobs and register new ones based on
   * the current settings. Safe to call at any time (idempotent).
   *
   * Prompt 31 can extend this method: add a similar block below the
   * backup block for the `reindexEnabled`/`reindexCron` pair.
   *
   * A malformed stored cron is logged and skipped — it must not crash boot.
   */
  syncSchedules(settings: MaintenanceSettings): void {
    // ── Backup job ────────────────────────────────────────────────────────────
    this.removeJobIfExists(BACKUP_JOB_NAME);

    if (settings.backupEnabled && settings.backupCron) {
      try {
        // Guard against a malformed cron expression that is somehow already stored.
        validateCronExpression(settings.backupCron);
      } catch {
        this.logger.warn(
          `Stored backupCron "${settings.backupCron}" is invalid — skipping schedule registration.`,
        );
        // Do not throw — never crash boot.
        return;
      }

      const job = new CronJob(settings.backupCron, () => {
        void this.runScheduledBackup();
      });

      this.schedulerAdapter.addCronJob(BACKUP_JOB_NAME, job);
      job.start();
      this.logger.log(`Scheduled backup job registered: "${settings.backupCron}"`);
    }

    // ── Reindex job ───────────────────────────────────────────────────────────
    this.removeJobIfExists(REINDEX_JOB_NAME);

    if (settings.reindexEnabled && settings.reindexCron) {
      try {
        validateCronExpression(settings.reindexCron);
      } catch {
        this.logger.warn(
          `Stored reindexCron "${settings.reindexCron}" is invalid — skipping schedule registration.`,
        );
        // Do not throw — never crash boot.
        return;
      }

      const job = new CronJob(settings.reindexCron, () => {
        void this.runScheduledReindex();
      });

      this.schedulerAdapter.addCronJob(REINDEX_JOB_NAME, job);
      job.start();
      this.logger.log(`Scheduled reindex job registered: "${settings.reindexCron}"`);
    }
  }

  private removeJobIfExists(name: string): void {
    try {
      if (this.schedulerAdapter.doesExist('cron', name)) {
        this.schedulerAdapter.getCronJob(name).stop();
        this.schedulerAdapter.deleteCronJob(name);
      }
    } catch (err) {
      this.logger.warn(`Failed to remove cron job "${name}": ${String(err)}`);
    }
  }

  /**
   * Called by the scheduled cron job. Uses a null actorUserId to mark this as a
   * system-initiated operation (no human actor). Audit metadata includes
   * `{ source: 'schedule' }` for traceability.
   */
  private async runScheduledBackup(): Promise<void> {
    const systemActor = { id: SYSTEM_ACTOR_ID } as unknown as User;
    try {
      await this.createBackup(systemActor, { source: 'schedule' });
    } catch (err) {
      this.logger.error('Scheduled backup failed', err);
    }
  }

  // ─── On-demand maintenance ───────────────────────────────────────────────────

  /**
   * Run a database maintenance operation on demand.
   *
   * Both VACUUM and REINDEX cannot run inside a transaction block — they are
   * shelled out to `psql` via the ExecRunner (args array, no shell interpolation
   * of DATABASE_URL). A non-zero psql exit or an execFile error surfaces as an
   * InternalServerErrorException.
   *
   * The audit action `maintenance.reindex` is used for both kinds (the `kind`
   * metadata field distinguishes them in the audit log).
   *
   * @param kind  Which operation to run: 'vacuum' or 'reindex'.
   * @param actor The user or system actor triggering the operation.
   */
  async runMaintenance(kind: MaintenanceKind, actor: User): Promise<MaintenanceResult> {
    const sql = MAINTENANCE_SQL[kind];
    const startMs = Date.now();

    try {
      // psql args as a discrete array: -d <url> -c <sql>
      // DATABASE_URL is never interpolated into a shell string.
      await this.exec('psql', ['-d', this.databaseUrl, '-c', sql]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Maintenance "${kind}" failed: ${message}`, err);
      throw new InternalServerErrorException(`Maintenance operation "${kind}" failed: ${message}`);
    }

    const durationMs = Date.now() - startMs;
    const completedAt = new Date().toISOString();

    await this.auditService.write({
      actorUserId: actor.id,
      action: 'maintenance.reindex',
      targetType: 'database',
      metadata: { kind, durationMs },
    });

    this.logger.log(`Maintenance "${kind}" completed in ${durationMs}ms`);

    return { kind, durationMs, completedAt };
  }

  /**
   * Called by the scheduled cron job. Runs both VACUUM ANALYZE and REINDEX
   * so the scheduled maintenance window covers both cleanup tasks.
   * Uses a null actorUserId to mark this as a system-initiated operation.
   */
  private async runScheduledReindex(): Promise<void> {
    const systemActor = { id: SYSTEM_ACTOR_ID } as unknown as User;
    try {
      await this.runMaintenance('vacuum', systemActor);
      await this.runMaintenance('reindex', systemActor);
    } catch (err) {
      this.logger.error('Scheduled reindex/vacuum failed', err);
    }
  }

  // ─── Backup operations ───────────────────────────────────────────────────────

  /** Ensure the backup directory exists, creating it if necessary. */
  private ensureBackupDir(): void {
    if (!this.fsAdapter.existsSync(this.backupDir)) {
      this.fsAdapter.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /** List all *.dump files in the backup dir, newest first. */
  listBackups(): BackupMeta[] {
    this.ensureBackupDir();
    let entries: Array<{ isFile(): boolean; name: string }>;
    try {
      entries = this.fsAdapter.readdirSync(this.backupDir);
    } catch {
      return [];
    }

    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.dump'))
      .map((e) => {
        const filePath = path.join(this.backupDir, e.name);
        const stat = this.fsAdapter.statSync(filePath);
        return {
          name: e.name,
          sizeBytes: stat.size,
          createdAt: stat.birthtime ?? stat.mtime,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Run pg_dump and create a new backup.
   * Uses exec runner (args array) — never interpolates DATABASE_URL into a shell string.
   * After creation, prunes old backups according to current settings.
   *
   * @param actor   The user triggering the backup (null actorUserId for scheduled runs).
   * @param extraMeta Additional audit metadata (e.g., `{ source: 'schedule' }`).
   */
  async createBackup(actor: User, extraMeta: Record<string, unknown> = {}): Promise<BackupMeta> {
    this.ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `gameledger-${timestamp}.dump`;
    const filePath = path.join(this.backupDir, filename);

    // pg_dump args as a discrete array: no shell expansion, no injection risk.
    await this.exec('pg_dump', ['-Fc', '-d', this.databaseUrl, '-f', filePath]);

    const stat = this.fsAdapter.statSync(filePath);
    const meta: BackupMeta = {
      name: filename,
      sizeBytes: stat.size,
      createdAt: stat.birthtime ?? stat.mtime,
    };

    await this.auditService.write({
      actorUserId: actor.id,
      action: 'backup.created',
      targetType: 'backup',
      targetId: filename,
      metadata: { sizeBytes: meta.sizeBytes, ...extraMeta },
    });

    // Prune oldest backups beyond the retention limit.
    const settings = await this.getSettings();
    await this.pruneBackups(settings.backupRetention, actor, extraMeta);

    return meta;
  }

  /**
   * Delete oldest `*.dump` backups beyond the retention limit.
   * If `retention` is 0 or falsy, all backups are kept.
   * Audits each deletion with `backup.deleted`.
   */
  async pruneBackups(
    retention: number,
    actor: User,
    extraMeta: Record<string, unknown> = {},
  ): Promise<void> {
    if (!retention || retention <= 0) return;

    const backups = this.listBackups(); // sorted newest-first
    const toDelete = backups.slice(retention); // oldest beyond limit

    for (const backup of toDelete) {
      const filePath = path.join(this.backupDir, backup.name);
      try {
        this.fsAdapter.unlinkSync(filePath);
        await this.auditService.write({
          actorUserId: actor.id,
          action: 'backup.deleted',
          targetType: 'backup',
          targetId: backup.name,
          metadata: { reason: 'retention_pruning', ...extraMeta },
        });
      } catch (err) {
        this.logger.error(`Failed to prune backup "${backup.name}"`, err);
      }
    }
  }

  /**
   * Resolve and validate a backup name to a safe absolute path.
   * Throws NotFoundException for invalid names or missing files.
   */
  getBackupPath(name: string): string {
    if (!BACKUP_NAME_RE.test(name)) {
      throw new NotFoundException(`Backup not found: ${name}`);
    }
    const resolved = path.resolve(this.backupDir, name);
    // Guard against path traversal (belt+suspenders alongside the regex).
    if (!resolved.startsWith(path.resolve(this.backupDir) + path.sep)) {
      throw new NotFoundException(`Backup not found: ${name}`);
    }
    if (!this.fsAdapter.existsSync(resolved)) {
      throw new NotFoundException(`Backup not found: ${name}`);
    }
    return resolved;
  }

  /** Delete a stored backup and audit the deletion. */
  async deleteBackup(name: string, actor: User): Promise<void> {
    const filePath = this.getBackupPath(name);
    this.fsAdapter.unlinkSync(filePath);
    await this.auditService.write({
      actorUserId: actor.id,
      action: 'backup.deleted',
      targetType: 'backup',
      targetId: name,
    });
  }

  /**
   * Restore the database from an absolute path.
   * Uses exec runner with an args array.
   *
   * CAUTION: this OVERWRITES all current data in the database.
   * The endpoint is gated to SUPER_ADMIN only for this reason.
   */
  async restoreFromFile(absPath: string, actor: User): Promise<void> {
    await this.exec('pg_restore', [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      '-d',
      this.databaseUrl,
      absPath,
    ]);

    await this.auditService.write({
      actorUserId: actor.id,
      action: 'backup.restored',
      targetType: 'backup',
      targetId: path.basename(absPath),
    });
  }

  /** Restore from a backup stored in the backup directory. */
  async restoreFromStored(name: string, actor: User): Promise<void> {
    const filePath = this.getBackupPath(name);
    await this.restoreFromFile(filePath, actor);
  }

  /** Restore from a temp-file upload, then remove the temp file. */
  async restoreFromUpload(tmpPath: string, actor: User): Promise<void> {
    try {
      await this.restoreFromFile(tmpPath, actor);
    } finally {
      // Always clean up the temp file, even on failure.
      try {
        this.fsAdapter.unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup — don't mask the original error.
      }
    }
  }

  /**
   * Read all domain data and return a sanitized JSON export snapshot.
   *
   * Secret-stripping rules (see docs/decisions.md):
   *   - User rows: passwordHash and lockout fields are omitted.
   *   - Session rows: excluded entirely (contain tokenHash secrets).
   *   - Token rows: excluded entirely (contain tokenHash secrets).
   *
   * Serialization:
   *   - BigInt (GameEvent.id): converted to string via the replacer so that
   *     JSON.stringify never throws. Note: main.ts also patches BigInt.prototype.toJSON,
   *     but we apply an explicit replacer here as belt-and-suspenders and to make the
   *     serialization safe even in test contexts where the prototype patch may not run.
   *   - Decimal (GameResult.score): Prisma returns Decimal objects; .toString() is called
   *     by the replacer to avoid precision loss and keep the JSON type as a numeric string.
   *
   * v1 note: all rows are read into memory before serialization. For databases with very
   * large game_events tables this could be significant. A streaming / cursor-based approach
   * would be a straightforward upgrade path if needed (iterate in chunks, write to a tmp
   * file, then stream the file). Buffering is acceptable for the expected data volumes of a
   * self-hosted household game tracker.
   */
  async exportAll(actor: User): Promise<ExportSnapshot> {
    const [
      games,
      participations,
      gameEvents,
      scoreStates,
      gameResults,
      players,
      playgroups,
      playgroupMembers,
      gameModules,
      groups,
      groupPermissions,
      userGroups,
      auditLogs,
      users,
      userPermissionOverrides,
    ] = await Promise.all([
      this.prisma.game.findMany(),
      this.prisma.participation.findMany(),
      this.prisma.gameEvent.findMany(),
      this.prisma.scoreState.findMany(),
      this.prisma.gameResult.findMany(),
      this.prisma.player.findMany(),
      this.prisma.playgroup.findMany(),
      this.prisma.playgroupMember.findMany(),
      this.prisma.gameModule.findMany(),
      this.prisma.group.findMany(),
      this.prisma.groupPermission.findMany(),
      this.prisma.userGroup.findMany(),
      this.prisma.auditLog.findMany(),
      this.prisma.user.findMany(),
      this.prisma.userPermissionOverride.findMany(),
    ]);

    // Strip secrets from User rows.
    const safeUsers = users.map(
      ({
        passwordHash: _passwordHash,
        failedLoginAttempts: _failedLoginAttempts,
        lockedUntil: _lockedUntil,
        ...rest
      }) => rest,
    );

    // Serialize Decimal values (GameResult.score) to strings so JSON.stringify
    // doesn't lose precision and can handle the Prisma Decimal object type.
    const safeGameResults = gameResults.map((r) => ({
      ...r,
      score: r.score != null ? r.score.toString() : null,
    }));

    const tables: Record<string, unknown[]> = {
      games,
      participations,
      // GameEvent.id is BigInt — the JSON replacer below handles serialization.
      game_events: gameEvents,
      // NOTE: the `feedbacks` table is intentionally excluded — it contains
      // binary screenshot blobs that would bloat the JSON export.
      score_states: scoreStates,
      game_results: safeGameResults,
      players,
      playgroups,
      playgroup_members: playgroupMembers,
      game_modules: gameModules,
      groups,
      group_permissions: groupPermissions,
      user_groups: userGroups,
      audit_logs: auditLogs,
      users: safeUsers,
      user_permission_overrides: userPermissionOverrides,
    };

    const rowCounts: Record<string, number> = {};
    for (const [key, rows] of Object.entries(tables)) {
      rowCounts[key] = rows.length;
    }

    await this.auditService.write({
      actorUserId: actor.id,
      action: 'export.generated',
      targetType: 'export',
      metadata: { rowCounts },
    });

    return {
      exportedAt: new Date().toISOString(),
      version: '1',
      tables,
    };
  }

  /**
   * JSON replacer that safely serializes BigInt values to strings.
   * Pass this to JSON.stringify when serializing an ExportSnapshot so that
   * GameEvent.id (BigInt) never causes "Do not know how to serialize a BigInt".
   * Note: main.ts patches BigInt.prototype.toJSON globally, so in production the
   * replacer is a belt-and-suspenders measure. In unit tests (where main.ts does
   * not run) it is the primary guard.
   */
  static jsonReplacer(_key: string, value: unknown): unknown {
    if (typeof value === 'bigint') return value.toString();
    return value;
  }
}
