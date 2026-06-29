import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  IsNumber,
  IsInt,
  MinLength,
  ArrayMinSize,
  IsUUID,
} from 'class-validator';

// ─── CreateGameDto ────────────────────────────────────────────────────────────

export class CreateGameDto {
  @IsString()
  @MinLength(1)
  moduleKey!: string;

  @IsOptional()
  @IsString()
  playgroupId?: string;

  /** Player.id array — guests or registered players, uniformly. */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  participantPlayerIds!: string[];

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

// ─── PostEventDto ─────────────────────────────────────────────────────────────

export class PostEventDto {
  /** Client-generated UUID; used for idempotency. */
  @IsUUID()
  clientEventId!: string;

  /** Current game version (= max seq, or 0 if no events). Used for optimistic concurrency. */
  @IsNumber()
  @IsInt()
  baseVersion!: number;

  /** Event type discriminator (e.g. "round_score"). */
  @IsString()
  @MinLength(1)
  type!: string;

  /** Event-type-specific data. */
  @IsObject()
  payload!: Record<string, unknown>;
}
