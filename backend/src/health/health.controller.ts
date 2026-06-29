import { Controller, Get } from '@nestjs/common';
import { HealthResponse } from '@game-ledger/contract';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
