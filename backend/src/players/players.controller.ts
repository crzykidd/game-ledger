import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PlayersService } from './players.service';
import {
  CreateGuestPlayerDto,
  RenamePlayerDto,
  CreatePlaygroupDto,
  RenamePlaygroupDto,
  SetMembersDto,
} from './players.dto';
import { AuthGuard } from '../rbac/auth.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { CurrentUser } from '../rbac/current-user.decorator';
import { Role } from '@game-ledger/contract';
import { User } from '@prisma/client';

// ─── Players ──────────────────────────────────────────────────────────────────

@Controller('players')
@UseGuards(AuthGuard, PermissionsGuard)
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  /** POST /api/players — create a guest player owned by the caller */
  @Post()
  @UseGuards(CsrfGuard)
  createGuestPlayer(@Body() dto: CreateGuestPlayerDto, @CurrentUser() user: User) {
    return this.playersService.createGuestPlayer(dto, user.id);
  }

  /** GET /api/players */
  @Get()
  listPlayers(@CurrentUser() user: User) {
    return this.playersService.listPlayers(user.id, user.role as Role);
  }

  /** GET /api/players/:id */
  @Get(':id')
  getPlayer(@Param('id') id: string, @CurrentUser() user: User) {
    return this.playersService.getPlayer(id, user.id, user.role as Role);
  }

  /** PATCH /api/players/:id */
  @Patch(':id')
  @UseGuards(CsrfGuard)
  renamePlayer(@Param('id') id: string, @Body() dto: RenamePlayerDto, @CurrentUser() user: User) {
    return this.playersService.renamePlayer(id, dto, user.id, user.role as Role);
  }
}

// ─── Playgroups ───────────────────────────────────────────────────────────────

@Controller('playgroups')
@UseGuards(AuthGuard, PermissionsGuard)
export class PlaygroupsController {
  constructor(private readonly playersService: PlayersService) {}

  /** POST /api/playgroups */
  @Post()
  @UseGuards(CsrfGuard)
  createPlaygroup(@Body() dto: CreatePlaygroupDto, @CurrentUser() user: User) {
    return this.playersService.createPlaygroup(dto, user.id);
  }

  /** GET /api/playgroups */
  @Get()
  listPlaygroups(@CurrentUser() user: User) {
    return this.playersService.listPlaygroups(user.id, user.role as Role);
  }

  /** GET /api/playgroups/:id */
  @Get(':id')
  getPlaygroup(@Param('id') id: string, @CurrentUser() user: User) {
    return this.playersService.getPlaygroup(id, user.id, user.role as Role);
  }

  /** PATCH /api/playgroups/:id */
  @Patch(':id')
  @UseGuards(CsrfGuard)
  renamePlaygroup(
    @Param('id') id: string,
    @Body() dto: RenamePlaygroupDto,
    @CurrentUser() user: User,
  ) {
    return this.playersService.renamePlaygroup(id, dto, user.id, user.role as Role);
  }

  /** PUT /api/playgroups/:id/members — replace full member list */
  @Put(':id/members')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  setMembers(@Param('id') id: string, @Body() dto: SetMembersDto, @CurrentUser() user: User) {
    return this.playersService.setMembers(id, dto, user.id, user.role as Role);
  }

  /** POST /api/playgroups/:id/members/:playerId */
  @Post(':id/members/:playerId')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  addMember(
    @Param('id') id: string,
    @Param('playerId') playerId: string,
    @CurrentUser() user: User,
  ) {
    return this.playersService.addMember(id, playerId, user.id, user.role as Role);
  }

  /** DELETE /api/playgroups/:id/members/:playerId */
  @Delete(':id/members/:playerId')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  removeMember(
    @Param('id') id: string,
    @Param('playerId') playerId: string,
    @CurrentUser() user: User,
  ) {
    return this.playersService.removeMember(id, playerId, user.id, user.role as Role);
  }
}
