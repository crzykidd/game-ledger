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
import { InvitesService } from './invites.service';
import { CreateInviteDto, AcceptInviteDto } from './invites.dto';
import { AuthGuard } from '../rbac/auth.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import { Permission } from '@game-ledger/contract';
import { User } from '@prisma/client';

@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  /**
   * GET /api/invites/accept/:token — public endpoint: validate token + return pre-fill.
   * Must be declared BEFORE the authenticated routes to avoid guard conflicts.
   */
  @Get('accept/:token')
  validateAccept(@Param('token') token: string) {
    return this.invitesService.validateAcceptToken(token);
  }

  /**
   * POST /api/invites/accept/:token — public endpoint: accept invite + create account.
   * CsrfGuard is skipped — unauthenticated flow with no existing session.
   */
  @Post('accept/:token')
  @HttpCode(HttpStatus.CREATED)
  acceptInvite(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    return this.invitesService.acceptInvite(token, dto);
  }

  // ─── Authenticated endpoints below ────────────────────────────────────────

  /** GET /api/invites */
  @Get()
  @UseGuards(AuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.INVITE_USERS)
  listInvites() {
    return this.invitesService.listInvites();
  }

  /** POST /api/invites */
  @Post()
  @UseGuards(AuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.INVITE_USERS)
  @HttpCode(HttpStatus.CREATED)
  createInvite(@Body() dto: CreateInviteDto, @CurrentUser() actor: User) {
    return this.invitesService.createInvite(dto, actor.id);
  }

  /** POST /api/invites/:id/revoke */
  @Post(':id/revoke')
  @UseGuards(AuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.INVITE_USERS)
  @HttpCode(HttpStatus.OK)
  revokeInvite(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.invitesService.revokeInvite(id, actor.id);
  }

  /** POST /api/invites/:id/regenerate */
  @Post(':id/regenerate')
  @UseGuards(AuthGuard, CsrfGuard, PermissionsGuard)
  @RequirePermissions(Permission.INVITE_USERS)
  @HttpCode(HttpStatus.CREATED)
  regenerateInvite(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.invitesService.regenerateInvite(id, actor.id);
  }
}
