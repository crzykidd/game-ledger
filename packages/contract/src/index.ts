// Shared types for game-ledger — used by both backend and frontend.

// ─── API utilities ────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok';
}

export interface ApiError {
  statusCode: number;
  message: string;
}

// ─── Auth / User enums ────────────────────────────────────────────────────────

/** Role tiers (highest to lowest). */
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  PLAYER = 'PLAYER',
}

/** Lifecycle state of a user account. */
export enum UserState {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

/** UI theme preference. */
export enum ThemePref {
  LIGHT = 'LIGHT',
  DARK = 'DARK',
  SYSTEM = 'SYSTEM',
}

// ─── Permissions ─────────────────────────────────────────────────────────────

/**
 * Atomic permission unit. Roles are named bundles of defaults; these are the
 * individual toggles that can be overridden per-user or per-group.
 */
export enum Permission {
  CREATE_GAME = 'CREATE_GAME',
  CONFIGURE_OWN_GAME = 'CONFIGURE_OWN_GAME',
  INVITE_USERS = 'INVITE_USERS',
  SEND_PASSWORD_RESET = 'SEND_PASSWORD_RESET',
  MANAGE_USERS = 'MANAGE_USERS',
  MANAGE_GROUPS_ROLES = 'MANAGE_GROUPS_ROLES',
  MANAGE_GLOBAL_SETTINGS = 'MANAGE_GLOBAL_SETTINGS',
  MANAGE_GAME_MODULES = 'MANAGE_GAME_MODULES',
  VIEW_ALL = 'VIEW_ALL',
}

/**
 * Role → default permission set.
 * Effective perms = role defaults, overridden by group, overridden by per-user toggle.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  [Role.SUPER_ADMIN]: new Set(Object.values(Permission)),
  [Role.ADMIN]: new Set([
    Permission.CREATE_GAME,
    Permission.CONFIGURE_OWN_GAME,
    Permission.INVITE_USERS,
    Permission.SEND_PASSWORD_RESET,
    Permission.MANAGE_USERS,
    Permission.MANAGE_GROUPS_ROLES,
    Permission.MANAGE_GLOBAL_SETTINGS,
    Permission.MANAGE_GAME_MODULES,
    Permission.VIEW_ALL,
  ]),
  [Role.MANAGER]: new Set([
    Permission.CREATE_GAME,
    Permission.CONFIGURE_OWN_GAME,
    Permission.INVITE_USERS,
    Permission.SEND_PASSWORD_RESET,
    Permission.MANAGE_USERS,
    Permission.MANAGE_GROUPS_ROLES,
    Permission.VIEW_ALL,
  ]),
  [Role.PLAYER]: new Set([
    Permission.CREATE_GAME,
    Permission.CONFIGURE_OWN_GAME,
    Permission.INVITE_USERS,
  ]),
};

// ─── Token enums ─────────────────────────────────────────────────────────────

/** Type discriminator for the typed-token table. */
export enum TokenType {
  INVITE = 'INVITE',
  PASSWORD_RESET = 'PASSWORD_RESET',
  SHARE = 'SHARE',
}

/** Lifecycle status of a token. */
export enum TokenStatus {
  PENDING = 'PENDING',
  CONSUMED = 'CONSUMED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

// ─── Game enums ───────────────────────────────────────────────────────────────

/** Status of a game instance. */
export enum GameStatus {
  ACTIVE = 'ACTIVE',
  COMPLETE = 'COMPLETE',
  ABANDONED = 'ABANDONED',
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

/**
 * The maintenance operation that can be triggered on demand via
 * POST /api/maintenance/run.
 *
 *  - 'vacuum'  — runs VACUUM (ANALYZE) on all tables (reclaims dead-tuple space,
 *                updates planner statistics). Usually fast.
 *  - 'reindex' — runs REINDEX DATABASE to rebuild all indexes from scratch.
 *                Can be slow on large databases; does not require downtime but
 *                holds a brief share lock per index while rebuilding.
 */
export type MaintenanceKind = 'vacuum' | 'reindex';

/**
 * Persisted maintenance configuration (singleton row).
 * Exposed on GET /api/maintenance/settings; updated via PUT /api/maintenance/settings.
 */
export interface MaintenanceSettings {
  /** Whether the scheduled backup job is active. */
  backupEnabled: boolean;
  /**
   * Cron expression for the backup schedule (e.g. `"0 3 * * *"`).
   * `null` means no schedule is configured.
   */
  backupCron: string | null;
  /**
   * Number of `*.dump` backups to retain. Oldest are pruned after each backup.
   * `0` means keep all backups.
   */
  backupRetention: number;
  /** Reserved for prompt 31 — whether the scheduled reindex job is active. */
  reindexEnabled: boolean;
  /** Reserved for prompt 31 — cron expression for the reindex schedule. */
  reindexCron: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Body for PUT /api/maintenance/settings.
 * All fields are optional — only provided fields are updated.
 */
export interface UpdateMaintenanceSettingsBody {
  backupEnabled?: boolean;
  backupCron?: string | null;
  backupRetention?: number;
  reindexEnabled?: boolean;
  reindexCron?: string | null;
}

// ─── Module schema ────────────────────────────────────────────────────────────

import moduleSchema from './module.schema.json';
export const MODULE_SCHEMA: Record<string, unknown> = moduleSchema;
