import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Parameter decorator that extracts the current authenticated user from the
 * request object (populated by AuthGuard).
 *
 * Usage: `(@CurrentUser() user: User)`
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return (request as any).user;
});
