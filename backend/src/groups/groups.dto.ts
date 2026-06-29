import { IsString, IsArray, IsBoolean, IsEnum, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { Permission } from '@game-ledger/contract';

export class CreateGroupDto {
  @IsString()
  name!: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  name?: string;
}

export class GroupPermissionEntry {
  @IsEnum(Permission)
  permission!: Permission;

  @IsBoolean()
  granted!: boolean;
}

export class SetGroupPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupPermissionEntry)
  permissions!: GroupPermissionEntry[];
}
