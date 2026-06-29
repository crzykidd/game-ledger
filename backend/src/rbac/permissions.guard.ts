import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, Role } from '@game-ledger/contract';
import { Request } from 'express';
import { PermissionService } from './permission.service';
import { PERMISSIONS_KEY, ROLES_KEY } from './require-permissions.decorator';

/**
 * Permissions guard: enforces @RequirePermissions and @RequireRole decorators.
 * Must be used AFTER AuthGuard (relies on request.user being set).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    // No decorators → pass through (rely on AuthGuard only).
    if (!requiredPermissions?.length && !requiredRoles?.length) {
      return true;
    }

    const request = ctx.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    if (!user) {
      throw new ForbiddenException('Not authenticated.');
    }

    // Role check (any match).
    if (requiredRoles?.length) {
      if (!requiredRoles.includes(user.role as Role)) {
        throw new ForbiddenException('Insufficient role.');
      }
    }

    // Permission check (all must be present).
    if (requiredPermissions?.length) {
      const effective = await this.permissionService.resolveEffectivePermissions(
        user.id,
        user.role as Role,
      );
      for (const perm of requiredPermissions) {
        if (!effective.has(perm)) {
          throw new ForbiddenException(`Missing permission: ${perm}`);
        }
      }
    }

    return true;
  }
}
