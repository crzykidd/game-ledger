import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { FeedbackCategory } from '@game-ledger/contract';

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

export class CreateFeedbackDto {
  @IsEnum(FeedbackCategory)
  category!: FeedbackCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;

  @IsString()
  @IsNotEmpty()
  route!: string;

  @IsOptional()
  @IsString()
  moduleKey?: string | null;

  @IsOptional()
  @IsString()
  moduleMaturity?: string | null;

  @IsOptional()
  @IsString()
  screenshotBase64?: string | null;

  /** Maximum base64 string length for a ~2 MB PNG. */
  static readonly MAX_SCREENSHOT_BASE64_LEN = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3);
}
