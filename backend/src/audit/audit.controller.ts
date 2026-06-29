import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuthGuard } from '../rbac/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { Permission } from '@game-ledger/contract';

@Controller('audit')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermissions(Permission.VIEW_ALL)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** GET /api/audit — recent audit log entries. */
  @Get()
  async getAuditLog(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 500) : 100;
    return this.auditService.findRecent(parsedLimit);
  }
}
