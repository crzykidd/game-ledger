import { SetMetadata } from '@nestjs/common';
import { Permission, Role } from '@game-ledger/contract';

export const PERMISSIONS_KEY = 'required_permissions';
export const ROLES_KEY = 'required_roles';

/**
 * Require that the authenticated user has ALL of the listed permissions.
 *
 * Usage: `@RequirePermissions(Permission.MANAGE_USERS, Permission.VIEW_ALL)`
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Require that the authenticated user has one of the listed roles.
 *
 * Usage: `@RequireRole(Role.ADMIN, Role.SUPER_ADMIN)`
 */
export const RequireRole = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
