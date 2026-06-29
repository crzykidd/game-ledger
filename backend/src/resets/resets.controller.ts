import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ResetsService } from './resets.service';
import { ConsumeResetDto } from './resets.dto';
import { AuthGuard } from '../rbac/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import { Permission } from '@game-ledger/contract';
import { User } from '@prisma/client';

@Controller('resets')
export class ResetsController {
  constructor(private readonly resetsService: ResetsService) {}

  /**
   * GET /api/resets/:token — public: validate a reset token.
   * Declared before authenticated routes to avoid guard conflicts.
   */
  @Get(':token')
  validateReset(@Param('token') token: string) {
    return this.resetsService.validateResetToken(token);
  }

  /**
   * POST /api/resets/:token — public: consume reset token, set new password.
   * Unauthenticated (user is locked out and needs to reset).
   */
  @Post(':token')
  @HttpCode(HttpStatus.OK)
  consumeReset(@Param('token') token: string, @Body() dto: ConsumeResetDto) {
    return this.resetsService.consumeResetToken(token, dto);
  }

  // ─── Authenticated endpoints ───────────────────────────────────────────────

  /**
   * GET /api/resets — list all reset links (requires SEND_PASSWORD_RESET or MANAGE_USERS).
   */
  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.SEND_PASSWORD_RESET)
  listResets() {
    return this.resetsService.listResets();
  }
}

/**
 * Reset-link creation lives under /api/users/:id/reset-link.
 * It is wired in via UsersModule/UsersController extending UsersService with a reset-link method.
 * However, to keep routing clean, we handle it in a sub-controller here.
 */
@Controller('users/:id/reset-link')
export class UserResetLinkController {
  constructor(private readonly resetsService: ResetsService) {}

  /** POST /api/users/:id/reset-link — issue a reset link for the target user. */
  @Post()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.SEND_PASSWORD_RESET)
  @HttpCode(HttpStatus.CREATED)
  createResetLink(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.resetsService.createResetLink(id, actor.id);
  }
}
