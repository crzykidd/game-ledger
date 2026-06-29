import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../rbac/auth.guard';
import { CurrentUser } from '../rbac/current-user.decorator';
import { ModuleLoaderService } from './module-loader.service';

/**
 * GET /api/modules — returns all loaded module definitions, each annotated
 * with `playCount`: the number of games the authenticated user has hosted.
 * Auth required; play counts are per-user (hosted = created_by).
 */
@Controller('modules')
@UseGuards(AuthGuard)
export class ModuleLoaderController {
  constructor(private readonly moduleLoaderService: ModuleLoaderService) {}

  @Get()
  listModules(@CurrentUser() user: { id: string }) {
    return this.moduleLoaderService.listModulesWithPlayCounts(user.id);
  }
}
