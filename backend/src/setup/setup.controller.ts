import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SetupService } from './setup.service';
import { CreateFirstUserDto } from './setup.dto';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  /** GET /api/setup/status — is the install wizard complete? */
  @Get('status')
  async getStatus() {
    return this.setupService.getStatus();
  }

  /** POST /api/setup — run the one-time install wizard. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async runSetup(@Body() dto: CreateFirstUserDto) {
    const result = await this.setupService.runSetup(dto);
    return {
      message: 'Setup complete. First Super Admin created.',
      userId: result.id,
    };
  }
}
