import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackSettingsService } from './feedback-settings.service';
import { GitHubService } from './github.service';

@Module({
  imports: [RbacModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackSettingsService, GitHubService],
  exports: [FeedbackService, FeedbackSettingsService],
})
export class FeedbackModule {}
