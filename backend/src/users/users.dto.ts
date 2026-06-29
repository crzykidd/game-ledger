import { IsString, IsOptional, IsBoolean, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Role, Permission } from '@game-ledger/contract';

export class ListUsersQueryDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeDisabled?: boolean;

  @IsOptional()
  @IsString()
  search?: string;
}

export class PatchUserDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}

export class PermissionOverrideEntry {
  @IsEnum(Permission)
  permission!: Permission;

  @IsBoolean()
  granted!: boolean;
}

export class SetUserPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionOverrideEntry)
  overrides!: PermissionOverrideEntry[];
}

export class SetUserGroupsDto {
  @IsArray()
  @IsString({ each: true })
  groupIds!: string[];
}
