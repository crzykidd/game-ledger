import { Test } from '@nestjs/testing';
import { FeedbackService } from './feedback.service';
import { FeedbackSettingsService } from './feedback-settings.service';
import { GitHubService } from './github.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FeedbackModule — Nest container resolution', () => {
  it('resolves all feedback providers through the Nest injector', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FeedbackService,
        FeedbackSettingsService,
        GitHubService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    expect(moduleRef.get(FeedbackService)).toBeInstanceOf(FeedbackService);
    expect(moduleRef.get(FeedbackSettingsService)).toBeInstanceOf(FeedbackSettingsService);
    expect(moduleRef.get(GitHubService)).toBeInstanceOf(GitHubService);
  });
});
