import { Role } from '@game-ledger/contract';

/**
 * Numeric tier for each role (lower = higher privilege).
 * SUPER_ADMIN = 0 (can act on anyone)
 * ADMIN       = 1
 * MANAGER     = 2
 * PLAYER      = 3
 */
export const ROLE_TIER: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 0,
  [Role.ADMIN]: 1,
  [Role.MANAGER]: 2,
  [Role.PLAYER]: 3,
};

/**
 * Returns true if `actorRole` is allowed to perform account-management
 * actions on a user with `targetRole`.
 *
 * Rules:
 *  - An actor can only manage accounts that are strictly below their own tier.
 *  - Only SUPER_ADMIN (tier 0) can manage ADMINs (tier 1).
 *
 * Examples:
 *  - SUPER_ADMIN can act on ADMIN, MANAGER, PLAYER  → true
 *  - ADMIN       can act on MANAGER, PLAYER          → true
 *  - ADMIN       cannot act on ADMIN                 → false
 *  - MANAGER     can act on PLAYER                   → true
 *  - MANAGER     cannot act on ADMIN or MANAGER      → false
 *  - PLAYER      cannot act on anyone                → false
 */
export function canActOn(actorRole: Role, targetRole: Role): boolean {
  return ROLE_TIER[actorRole] < ROLE_TIER[targetRole];
}
