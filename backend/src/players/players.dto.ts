import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class CreateGuestPlayerDto {
  @IsString()
  nickname!: string;
}

export class RenamePlayerDto {
  @IsString()
  nickname!: string;
}

export class ListPlayersQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * When true, include all players (managers / viewAll only).
   * Normal callers always see their own roster.
   */
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

// ─── Playgroups ────────────────────────────────────────────────────────────────

export class CreatePlaygroupDto {
  @IsString()
  name!: string;

  /**
   * Optional list of player IDs to seed the group with.
   * Both guest and registered Players are accepted.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memberPlayerIds?: string[];
}

export class RenamePlaygroupDto {
  @IsString()
  name!: string;
}

export class SetMembersDto {
  @IsArray()
  @IsString({ each: true })
  playerIds!: string[];
}
