import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { CsrfService } from './csrf.service';

export const CSRF_HEADER = 'x-csrf-token';
export const CSRF_COOKIE = 'gl_csrf';

/**
 * CSRF guard — enforces the double-submit pattern for state-changing requests.
 *
 * Reads:
 *  - `X-CSRF-Token` header from the request
 *  - `gl_csrf` cookie from the request
 *
 * Then validates both match for the current session id.
 * Pair with AuthGuard (which sets request.session).
 *
 * Safe-method exemption: GET/HEAD/OPTIONS are not checked.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrfService: CsrfService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest<Request>();

    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(request.method)) {
      return true;
    }

    const headerToken = request.headers[CSRF_HEADER] as string | undefined;
    const cookieToken = request.cookies?.[CSRF_COOKIE];
    const session = (request as any).session;

    if (!headerToken || !cookieToken) {
      throw new ForbiddenException('CSRF token missing.');
    }

    if (headerToken !== cookieToken) {
      throw new ForbiddenException('CSRF token mismatch.');
    }

    if (session?.id) {
      if (!this.csrfService.validateToken(session.id, headerToken)) {
        throw new ForbiddenException('CSRF token invalid.');
      }
    }

    return true;
  }
}
