import { IsIn } from 'class-validator';
import { MaintenanceKind } from '@game-ledger/contract';

/** Valid maintenance kinds as a tuple (required by IsIn). */
const MAINTENANCE_KINDS: readonly MaintenanceKind[] = ['vacuum', 'reindex'];

export class RunMaintenanceDto {
  /**
   * Which database maintenance operation to run.
   *
   * - `vacuum`  — VACUUM (ANALYZE): reclaims space from dead tuples and updates
   *               planner statistics. Usually fast.
   * - `reindex` — REINDEX DATABASE: rebuilds all indexes from scratch. Can be
   *               slow on large databases but does not require downtime.
   *
   * Both operations shell out to `psql` because VACUUM and REINDEX cannot run
   * inside a transaction block (Prisma's `$executeRaw` wraps statements in one).
   */
  @IsIn(MAINTENANCE_KINDS as MaintenanceKind[])
  kind!: MaintenanceKind;
}
