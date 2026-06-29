import { Injectable } from '@nestjs/common';
import { Permission, Role, ROLE_DEFAULT_PERMISSIONS } from '@game-ledger/contract';
import { PrismaService } from '../prisma/prisma.service';

export interface PermissionResolutionInput {
  userId: string;
  role: Role;
}

/**
 * Resolves effective permissions for a user.
 *
 * Resolution order (later overrides earlier):
 *   1. Role defaults (ROLE_DEFAULT_PERMISSIONS[role])
 *   2. Group overrides (via UserGroup → GroupPermission), merged in insertion order
 *   3. Per-user overrides (UserPermissionOverride)
 *
 * Both `granted: true` and `granted: false` are honored — a deny at a higher
 * priority level beats a grant from a lower-priority one.
 */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveEffectivePermissions(userId: string, role: Role): Promise<Set<Permission>> {
    // 1. Start with role defaults.
    const effective = new Map<Permission, boolean>();
    for (const perm of ROLE_DEFAULT_PERMISSIONS[role]) {
      effective.set(perm, true);
    }

    // 2. Apply group overrides (ordered by group membership insertion).
    const userGroups = await this.prisma.userGroup.findMany({
      where: { userId },
      include: { group: { include: { permissions: true } } },
    });

    for (const ug of userGroups) {
      for (const gp of ug.group.permissions) {
        effective.set(gp.permission as Permission, gp.granted);
      }
    }

    // 3. Apply per-user overrides (highest priority).
    const userOverrides = await this.prisma.userPermissionOverride.findMany({
      where: { userId },
    });
    for (const override of userOverrides) {
      effective.set(override.permission as Permission, override.granted);
    }

    // Collect only the granted ones.
    const result = new Set<Permission>();
    for (const [perm, granted] of effective) {
      if (granted) result.add(perm);
    }
    return result;
  }

  /**
   * Pure (no DB) resolution for unit-testing or in-memory use.
   * Accepts pre-fetched group and user overrides.
   */
  resolveEffectivePermissionsSync(
    role: Role,
    groupOverrides: Array<{ permission: Permission; granted: boolean }>,
    userOverrides: Array<{ permission: Permission; granted: boolean }>,
  ): Set<Permission> {
    const effective = new Map<Permission, boolean>();

    for (const perm of ROLE_DEFAULT_PERMISSIONS[role]) {
      effective.set(perm, true);
    }
    for (const go of groupOverrides) {
      effective.set(go.permission, go.granted);
    }
    for (const uo of userOverrides) {
      effective.set(uo.permission, uo.granted);
    }

    const result = new Set<Permission>();
    for (const [perm, granted] of effective) {
      if (granted) result.add(perm);
    }
    return result;
  }
}
