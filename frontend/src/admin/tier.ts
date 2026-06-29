import { Role } from '@game-ledger/contract';

/**
 * Numeric tier for each role (lower = higher privilege).
 * Mirrors backend src/rbac/tier-rule.ts.
 */
export const ROLE_TIER: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 0,
  [Role.ADMIN]: 1,
  [Role.MANAGER]: 2,
  [Role.PLAYER]: 3,
};

/**
 * Returns true if `actorRole` can perform account-management actions on
 * a user with `targetRole` (actor tier must be strictly lower than target tier).
 */
export function canActOn(actorRole: Role, targetRole: Role): boolean {
  return ROLE_TIER[actorRole] < ROLE_TIER[targetRole];
}

/** Human-readable label for a role. */
export function roleLabel(role: Role): string {
  switch (role) {
    case Role.SUPER_ADMIN:
      return 'Super Admin';
    case Role.ADMIN:
      return 'Admin';
    case Role.MANAGER:
      return 'Manager';
    case Role.PLAYER:
      return 'Player';
  }
}

/**
 * Returns the list of roles that an actor can assign (i.e. roles strictly
 * below the actor's tier).
 */
export function assignableRoles(actorRole: Role): Role[] {
  return Object.values(Role).filter((r) => canActOn(actorRole, r));
}
