import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from '../auth/session.service';

export const SESSION_COOKIE = 'gl_session';

/**
 * Auth guard: reads the session cookie, validates the token, and attaches
 * the user (with effective permissions) to `request.user`.
 * Returns 401 if the session is absent, expired, or revoked.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest<Request>();

    const rawToken = request.cookies?.[SESSION_COOKIE];
    if (!rawToken) {
      throw new UnauthorizedException('No session cookie.');
    }

    const sessionWithUser = await this.sessionService.validateSession(rawToken);
    if (!sessionWithUser) {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    if (sessionWithUser.user.state !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active.');
    }

    // Attach to request for downstream use.
    (request as any).user = sessionWithUser.user;
    (request as any).session = sessionWithUser;
    (request as any).rawSessionToken = rawToken;

    return true;
  }
}
