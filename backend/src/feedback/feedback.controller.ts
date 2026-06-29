import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Res,
  HttpCode,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { FeedbackService } from './feedback.service';
import { FeedbackSettingsService } from './feedback-settings.service';
import { CreateFeedbackDto } from './create-feedback.dto';
import { UpdateFeedbackSettingsDto } from './update-feedback-settings.dto';
import { UpdateFeedbackStatusDto } from './update-feedback-status.dto';
import { AuthGuard } from '../rbac/auth.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions, RequireRole } from '../rbac/require-permissions.decorator';
import { CurrentUser } from '../rbac/current-user.decorator';
import { Permission, Role } from '@game-ledger/contract';
import { User } from '@prisma/client';

@Controller()
@UseGuards(AuthGuard)
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly feedbackSettingsService: FeedbackSettingsService,
  ) {}

  /**
   * POST /api/feedback — submit feedback (any authenticated user).
   * Throttled at ~5/min per IP.
   */
  @Post('feedback')
  @UseGuards(ThrottlerGuard, CsrfGuard)
  @Throttle({ feedback: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  create(@Body() dto: CreateFeedbackDto, @CurrentUser() user: User) {
    return this.feedbackService.create(user, dto);
  }

  /** GET /api/admin/feedback — list all feedback (VIEW_ALL). */
  @Get('admin/feedback')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.VIEW_ALL)
  list() {
    return this.feedbackService.list();
  }

  /** GET /api/admin/feedback/:id — get one feedback item (VIEW_ALL). */
  @Get('admin/feedback/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.VIEW_ALL)
  get(@Param('id') id: string) {
    return this.feedbackService.get(id);
  }

  /** GET /api/admin/feedback/:id/screenshot — stream the PNG (VIEW_ALL). */
  @Get('admin/feedback/:id/screenshot')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.VIEW_ALL)
  async getScreenshot(@Param('id') id: string, @Res() res: Response) {
    const { data, mime } = await this.feedbackService.getScreenshot(id);
    res.setHeader('Content-Type', mime).send(data);
  }

  /** PATCH /api/admin/feedback/:id — update status OPEN/CLOSED (VIEW_ALL). */
  @Patch('admin/feedback/:id')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions(Permission.VIEW_ALL)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  updateStatus(@Param('id') id: string, @Body() dto: UpdateFeedbackStatusDto) {
    return this.feedbackService.updateStatus(id, dto.status);
  }

  /** GET /api/feedback/settings — read GitHub integration config (MANAGE_GLOBAL_SETTINGS). */
  @Get('feedback/settings')
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permission.MANAGE_GLOBAL_SETTINGS)
  getSettings() {
    return this.feedbackSettingsService.getSettings();
  }

  /** PUT /api/feedback/settings — update GitHub integration config (SUPER_ADMIN only). */
  @Put('feedback/settings')
  @UseGuards(PermissionsGuard, CsrfGuard)
  @RequirePermissions(Permission.MANAGE_GLOBAL_SETTINGS)
  @RequireRole(Role.SUPER_ADMIN)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  updateSettings(@Body() dto: UpdateFeedbackSettingsDto) {
    return this.feedbackSettingsService.updateSettings(dto);
  }
}
