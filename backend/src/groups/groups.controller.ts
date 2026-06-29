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
import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto, SetGroupPermissionsDto } from './groups.dto';
import { AuthGuard } from '../rbac/auth.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import { Permission } from '@game-ledger/contract';
import { User } from '@prisma/client';

@Controller('groups')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.MANAGE_GROUPS_ROLES)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /** GET /api/groups */
  @Get()
  listGroups() {
    return this.groupsService.listGroups();
  }

  /** GET /api/groups/:id */
  @Get(':id')
  getGroup(@Param('id') id: string) {
    return this.groupsService.getGroup(id);
  }

  /** POST /api/groups */
  @Post()
  @UseGuards(CsrfGuard)
  createGroup(@Body() dto: CreateGroupDto, @CurrentUser() actor: User) {
    return this.groupsService.createGroup(dto, actor.id);
  }

  /** PATCH /api/groups/:id */
  @Patch(':id')
  @UseGuards(CsrfGuard)
  updateGroup(@Param('id') id: string, @Body() dto: UpdateGroupDto, @CurrentUser() actor: User) {
    return this.groupsService.updateGroup(id, dto, actor.id);
  }

  /** DELETE /api/groups/:id */
  @Delete(':id')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGroup(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.groupsService.deleteGroup(id, actor.id);
  }

  /** PUT /api/groups/:id/permissions */
  @Put(':id/permissions')
  @UseGuards(CsrfGuard)
  setGroupPermissions(
    @Param('id') id: string,
    @Body() dto: SetGroupPermissionsDto,
    @CurrentUser() actor: User,
  ) {
    return this.groupsService.setGroupPermissions(id, dto, actor.id);
  }
}
