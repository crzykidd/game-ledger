import { IsBoolean, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { BadRequestException } from '@nestjs/common';

/**
 * Validates a cron expression — accepts a 5-field standard cron string.
 * Uses a regex that covers the most common cron syntax (numbers, ranges, steps,
 * wildcards). More exotic expressions (e.g., year field, named months/weekdays)
 * are intentionally excluded to keep validation tight; expand the regex if needed.
 */
export function validateCronExpression(value: string): void {
  // Each cron field: digit, range (1-5), step (star/digit with /step), wildcard
  const FIELD = String.raw`(\*|\d+)(/\d+)?(-\d+)?`;
  const CRON_RE = new RegExp(`^${FIELD}\\s+${FIELD}\\s+${FIELD}\\s+${FIELD}\\s+${FIELD}$`);
  if (!CRON_RE.test(value.trim())) {
    throw new BadRequestException(`Invalid cron expression: "${value}"`);
  }
}

export class UpdateMaintenanceSettingsDto {
  @IsOptional()
  @IsBoolean()
  backupEnabled?: boolean;

  /**
   * Cron expression string, or `null` to clear the schedule.
   * Validated as a 5-field cron expression when non-null.
   */
  @IsOptional()
  @ValidateIf(
    (o: UpdateMaintenanceSettingsDto) => o.backupCron !== null && o.backupCron !== undefined,
  )
  @IsString()
  backupCron?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  backupRetention?: number;

  @IsOptional()
  @IsBoolean()
  reindexEnabled?: boolean;

  /**
   * Cron expression string, or `null` to clear the schedule.
   * Validated as a 5-field cron expression when non-null.
   */
  @IsOptional()
  @ValidateIf(
    (o: UpdateMaintenanceSettingsDto) => o.reindexCron !== null && o.reindexCron !== undefined,
  )
  @IsString()
  reindexCron?: string | null;
}
