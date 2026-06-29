import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Res,
  Body,
  HttpCode,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as os from 'os';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const multer = require('multer') as { diskStorage: (opts: object) => object };
import { MaintenanceService } from './maintenance.service';
import { UpdateMaintenanceSettingsDto } from './update-maintenance-settings.dto';
import { RunMaintenanceDto } from './run-maintenance.dto';
import { AuthGuard } from '../rbac/auth.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions, RequireRole } from '../rbac/require-permissions.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import { Permission, Role } from '@game-ledger/contract';
import { User } from '@prisma/client';

/** Subset of multer's File object that we actually use. */
interface UploadedDumpFile {
  path: string;
  originalname: string;
  size: number;
}

@Controller('maintenance')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.MANAGE_GLOBAL_SETTINGS)
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  /**
   * GET /api/maintenance/settings — read the singleton maintenance settings.
   * Returns defaults (backupEnabled=false, backupRetention=7) if the row does not exist yet.
   */
  @Get('settings')
  getSettings() {
    return this.maintenanceService.getSettings();
  }

  /**
   * PUT /api/maintenance/settings — update maintenance settings.
   * All fields are optional; only provided fields are changed.
   * Rejects invalid cron expressions with 400 Bad Request.
   */
  @Put('settings')
  @UseGuards(CsrfGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  updateSettings(@Body() dto: UpdateMaintenanceSettingsDto, @CurrentUser() actor: User) {
    return this.maintenanceService.updateSettings(dto, actor);
  }

  /**
   * POST /api/maintenance/run — trigger an on-demand maintenance operation.
   *
   * Accepts `{ kind: 'vacuum' | 'reindex' }` in the request body.
   *
   * - `vacuum`  — runs VACUUM (ANALYZE) via psql. Reclaims dead-tuple space and
   *               updates planner statistics. Usually completes in seconds.
   * - `reindex` — runs REINDEX DATABASE via psql. Rebuilds all indexes from scratch.
   *               Can be slow on large databases; the operation is logged and audited.
   *
   * Both operations shell out to psql because VACUUM and REINDEX cannot run inside
   * a transaction block. Requires MANAGE_GLOBAL_SETTINGS permission (class-level guard).
   * SUPER_ADMIN is NOT required — these operations are operational, not destructive.
   *
   * Returns `{ kind, durationMs, completedAt }` on success.
   * Returns 500 with a descriptive message if psql exits non-zero.
   */
  @Post('run')
  @UseGuards(CsrfGuard)
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  runMaintenance(@Body() dto: RunMaintenanceDto, @CurrentUser() actor: User) {
    return this.maintenanceService.runMaintenance(dto.kind, actor);
  }

  /**
   * GET /api/maintenance/export — export all domain data as a downloadable JSON file.
   *
   * Secrets excluded: passwordHash, lockedUntil, failedLoginAttempts stripped from User rows;
   * Session and Token tables omitted entirely.
   *
   * v1: buffers the full snapshot in memory before sending. For a household-scale DB this is
   * fine; if game_events tables grow very large a streaming cursor-based approach (write to
   * temp file, pipe with StreamableFile) would avoid the memory spike.
   */
  @Get('export')
  async exportAll(@CurrentUser() actor: User, @Res() res: Response) {
    const snapshot = await this.maintenanceService.exportAll(actor);
    const timestamp = snapshot.exportedAt.replace(/[:.]/g, '-');
    const filename = `game-ledger-export-${timestamp}.json`;
    const body = JSON.stringify(snapshot, MaintenanceService.jsonReplacer, 2);

    res
      .setHeader('Content-Type', 'application/json')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(body);
  }

  /** GET /api/maintenance/backups — list stored backups, newest first. */
  @Get('backups')
  listBackups() {
    return this.maintenanceService.listBackups();
  }

  /**
   * POST /api/maintenance/backups — trigger a pg_dump.
   * Returns 200 with the new backup metadata.
   */
  @Post('backups')
  @UseGuards(CsrfGuard)
  @HttpCode(200)
  createBackup(@CurrentUser() actor: User) {
    return this.maintenanceService.createBackup(actor);
  }

  /**
   * GET /api/maintenance/backups/:name/download — stream a backup file.
   * Uses res.download() which sets Content-Disposition: attachment.
   */
  @Get('backups/:name/download')
  async downloadBackup(@Param('name') name: string, @Res() res: Response) {
    const filePath = this.maintenanceService.getBackupPath(name);
    res.download(filePath, name);
  }

  /**
   * DELETE /api/maintenance/backups/:name — delete a stored backup.
   */
  @Delete('backups/:name')
  @UseGuards(CsrfGuard)
  @HttpCode(200)
  deleteBackup(@Param('name') name: string, @CurrentUser() actor: User) {
    return this.maintenanceService.deleteBackup(name, actor);
  }

  /**
   * POST /api/maintenance/backups/:name/restore — restore from a stored backup.
   * SUPER_ADMIN only (in addition to MANAGE_GLOBAL_SETTINGS).
   * CAUTION: overwrites all current database data.
   */
  @Post('backups/:name/restore')
  @UseGuards(CsrfGuard)
  @RequireRole(Role.SUPER_ADMIN)
  @HttpCode(200)
  restoreFromStored(@Param('name') name: string, @CurrentUser() actor: User) {
    return this.maintenanceService.restoreFromStored(name, actor);
  }

  /**
   * POST /api/maintenance/restore — restore from an uploaded .dump file.
   * SUPER_ADMIN only.
   * Accepts multipart/form-data with field name "file".
   * CAUTION: overwrites all current database data.
   */
  @Post('restore')
  @UseGuards(CsrfGuard)
  @RequireRole(Role.SUPER_ADMIN)
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.diskStorage({
        destination: os.tmpdir(),
        filename: (_req: unknown, file: UploadedDumpFile, cb: (e: null, name: string) => void) => {
          const safe = `restore-upload-${Date.now()}${path.extname(file.originalname)}`;
          cb(null, safe);
        },
      }),
      limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max upload
    }),
  )
  async restoreFromUpload(
    @UploadedFile() file: UploadedDumpFile | undefined,
    @CurrentUser() actor: User,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded. Send a .dump file in the "file" field.');
    }
    await this.maintenanceService.restoreFromUpload(file.path, actor);
    return { restored: true };
  }
}
