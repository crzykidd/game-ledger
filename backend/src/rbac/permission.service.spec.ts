/**
 * Unit tests for PermissionService.resolveEffectivePermissionsSync.
 *
 * Uses the pure in-memory method (no DB) so no Prisma mock is needed.
 */
import { PermissionService } from './permission.service';
import { Permission, Role } from '@game-ledger/contract';

describe('PermissionService - permission resolution', () => {
  let svc: PermissionService;

  beforeEach(() => {
    // Inject a null prisma; the sync method doesn't use it.
    svc = new PermissionService(null as any);
  });

  // ── Role defaults ──────────────────────────────────────────────────────────

  it('SUPER_ADMIN has all permissions by default', () => {
    const result = svc.resolveEffectivePermissionsSync(Role.SUPER_ADMIN, [], []);
    for (const p of Object.values(Permission)) {
      expect(result.has(p)).toBe(true);
    }
  });

  it('PLAYER has CREATE_GAME, CONFIGURE_OWN_GAME, INVITE_USERS by default', () => {
    const result = svc.resolveEffectivePermissionsSync(Role.PLAYER, [], []);
    expect(result.has(Permission.CREATE_GAME)).toBe(true);
    expect(result.has(Permission.CONFIGURE_OWN_GAME)).toBe(true);
    expect(result.has(Permission.INVITE_USERS)).toBe(true);
    expect(result.has(Permission.MANAGE_USERS)).toBe(false);
  });

  it('ADMIN has MANAGE_USERS by default', () => {
    const result = svc.resolveEffectivePermissionsSync(Role.ADMIN, [], []);
    expect(result.has(Permission.MANAGE_USERS)).toBe(true);
  });

  it('MANAGER has MANAGE_USERS but not MANAGE_GLOBAL_SETTINGS', () => {
    const result = svc.resolveEffectivePermissionsSync(Role.MANAGER, [], []);
    expect(result.has(Permission.MANAGE_USERS)).toBe(true);
    expect(result.has(Permission.MANAGE_GLOBAL_SETTINGS)).toBe(false);
  });

  // ── Group overrides ────────────────────────────────────────────────────────

  it('group can deny a permission granted by role default', () => {
    // PLAYER has INVITE_USERS by default; a group can deny it
    const result = svc.resolveEffectivePermissionsSync(
      Role.PLAYER,
      [{ permission: Permission.INVITE_USERS, granted: false }],
      [],
    );
    expect(result.has(Permission.INVITE_USERS)).toBe(false);
    // Other defaults still apply
    expect(result.has(Permission.CREATE_GAME)).toBe(true);
  });

  it('group can grant a permission not in role default', () => {
    // PLAYER doesn't have SEND_PASSWORD_RESET by default
    const result = svc.resolveEffectivePermissionsSync(
      Role.PLAYER,
      [{ permission: Permission.SEND_PASSWORD_RESET, granted: true }],
      [],
    );
    expect(result.has(Permission.SEND_PASSWORD_RESET)).toBe(true);
  });

  // ── Per-user overrides ─────────────────────────────────────────────────────

  it('per-user override can deny a permission', () => {
    const result = svc.resolveEffectivePermissionsSync(
      Role.PLAYER,
      [],
      [{ permission: Permission.CREATE_GAME, granted: false }],
    );
    expect(result.has(Permission.CREATE_GAME)).toBe(false);
  });

  it('per-user override can grant a permission not in role default', () => {
    const result = svc.resolveEffectivePermissionsSync(
      Role.PLAYER,
      [],
      [{ permission: Permission.MANAGE_GAME_MODULES, granted: true }],
    );
    expect(result.has(Permission.MANAGE_GAME_MODULES)).toBe(true);
  });

  // ── Override priority: per-user beats group ────────────────────────────────

  it('per-user grant overrides group deny', () => {
    // Group denies INVITE_USERS, but per-user grants it back
    const result = svc.resolveEffectivePermissionsSync(
      Role.PLAYER,
      [{ permission: Permission.INVITE_USERS, granted: false }],
      [{ permission: Permission.INVITE_USERS, granted: true }],
    );
    expect(result.has(Permission.INVITE_USERS)).toBe(true);
  });

  it('per-user deny overrides group grant', () => {
    // Group grants MANAGE_USERS, but per-user denies it
    const result = svc.resolveEffectivePermissionsSync(
      Role.PLAYER,
      [{ permission: Permission.MANAGE_USERS, granted: true }],
      [{ permission: Permission.MANAGE_USERS, granted: false }],
    );
    expect(result.has(Permission.MANAGE_USERS)).toBe(false);
  });
});
