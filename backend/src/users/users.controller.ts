import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  ListUsersQueryDto,
  PatchUserDto,
  SetUserPermissionsDto,
  SetUserGroupsDto,
} from './users.dto';
import { AuthGuard } from '../rbac/auth.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import { Permission, Role } from '@game-ledger/contract';
import { User } from '@prisma/client';

@Controller('users')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.MANAGE_USERS)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /api/users */
  @Get()
  listUsers(@Query() query: ListUsersQueryDto) {
    const includeDisabled =
      query.includeDisabled === true || (query.includeDisabled as any) === 'true';
    return this.usersService.listUsers(includeDisabled, query.search);
  }

  /** GET /api/users/:id */
  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.usersService.getUser(id);
  }

  /** PATCH /api/users/:id */
  @Patch(':id')
  @UseGuards(CsrfGuard)
  patchUser(@Param('id') id: string, @Body() dto: PatchUserDto, @CurrentUser() actor: User) {
    return this.usersService.patchUser(id, dto, actor.role as Role, actor.id);
  }

  /** POST /api/users/:id/disable */
  @Post(':id/disable')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  disableUser(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.usersService.disableUser(id, actor.role as Role, actor.id);
  }

  /** POST /api/users/:id/enable */
  @Post(':id/enable')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  enableUser(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.usersService.enableUser(id, actor.role as Role, actor.id);
  }

  /** PUT /api/users/:id/permissions */
  @Put(':id/permissions')
  @UseGuards(CsrfGuard)
  setUserPermissions(
    @Param('id') id: string,
    @Body() dto: SetUserPermissionsDto,
    @CurrentUser() actor: User,
  ) {
    return this.usersService.setUserPermissions(id, dto, actor.role as Role, actor.id);
  }

  /** PUT /api/users/:id/groups */
  @Put(':id/groups')
  @UseGuards(CsrfGuard)
  setUserGroups(
    @Param('id') id: string,
    @Body() dto: SetUserGroupsDto,
    @CurrentUser() actor: User,
  ) {
    return this.usersService.setUserGroups(id, dto, actor.role as Role, actor.id);
  }
}
