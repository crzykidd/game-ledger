import { Controller, Get } from '@nestjs/common';
import { VersionService } from './version.service';

export interface VersionResponse {
  version: string;
}

/**
 * Public endpoint — no auth guard.
 * GET /api/version → { version: "X.Y.Z" }
 */
@Controller('version')
export class VersionController {
  constructor(private readonly versionService: VersionService) {}

  @Get()
  getVersion(): VersionResponse {
    return { version: this.versionService.getVersion() };
  }
}
