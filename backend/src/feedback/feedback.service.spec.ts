import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FeedbackSettingsService } from './feedback-settings.service';
import { GitHubService } from './github.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeedbackDto } from './create-feedback.dto';
import { FeedbackCategory, FeedbackStatus } from '@game-ledger/contract';

const mockReporter = { id: 'user-1', nickname: 'Tester' } as any;

const baseFeedbackRow = {
  id: 'fb-1',
  reporterUserId: 'user-1',
  reporter: { nickname: 'Tester' },
  route: '/play',
  moduleKey: null,
  moduleMaturity: null,
  category: FeedbackCategory.BUG,
  text: 'Something broke',
  screenshot: null,
  screenshotMime: null,
  githubIssueUrl: null,
  githubIssueNumber: null,
  status: FeedbackStatus.OPEN,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const disabledSettings = {
  id: 1,
  githubEnabled: false,
  githubToken: null,
  githubRepoOwner: null,
  githubRepoName: null,
  githubAssetBranch: 'feedback-assets',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const enabledSettings = {
  ...disabledSettings,
  githubEnabled: true,
  githubToken: 'ghp_test',
  githubRepoOwner: 'owner',
  githubRepoName: 'repo',
};

function makeService(opts: {
  feedbackRow?: object;
  rawSettings?: object;
  githubResult?: object | Error;
  updateMock?: jest.Mock;
  findUniqueMock?: jest.Mock;
}) {
  const feedbackRow = opts.feedbackRow ?? baseFeedbackRow;
  const updateMock = opts.updateMock ?? jest.fn().mockResolvedValue(feedbackRow);
  const findUniqueMock = opts.findUniqueMock ?? jest.fn().mockResolvedValue(feedbackRow);

  const prisma = {
    feedback: {
      create: jest.fn().mockResolvedValue(feedbackRow),
      findMany: jest.fn().mockResolvedValue([feedbackRow]),
      findUnique: findUniqueMock,
      update: updateMock,
    },
  } as unknown as PrismaService;

  const settingsService = {
    getRawSettings: jest.fn().mockResolvedValue(opts.rawSettings ?? disabledSettings),
  } as unknown as FeedbackSettingsService;

  const githubResult = opts.githubResult;
  const githubService = {
    createIssueWithScreenshot:
      githubResult instanceof Error
        ? jest.fn().mockRejectedValue(githubResult)
        : jest
            .fn()
            .mockResolvedValue(
              githubResult ?? { url: 'https://github.com/o/r/issues/1', number: 1 },
            ),
  } as unknown as GitHubService;

  return {
    svc: new FeedbackService(prisma, settingsService, githubService),
    prisma,
    githubService,
  };
}

describe('FeedbackService', () => {
  describe('create', () => {
    it('saves the row and returns null githubIssueUrl when GitHub is disabled', async () => {
      const { svc } = makeService({});
      const result = await svc.create(mockReporter, {
        category: FeedbackCategory.BUG,
        text: 'Something broke',
        route: '/play',
      });
      expect(result.id).toBe('fb-1');
      expect(result.githubIssueUrl).toBeNull();
    });

    it('calls GitHub and patches the row when enabled + succeeds', async () => {
      const withIssue = {
        ...baseFeedbackRow,
        githubIssueUrl: 'https://github.com/o/r/issues/1',
        githubIssueNumber: 1,
        reporter: { nickname: 'Tester' },
      };
      const updateMock = jest.fn().mockResolvedValue(withIssue);
      const findUniqueMock = jest.fn().mockResolvedValue(withIssue);
      const { svc } = makeService({
        rawSettings: enabledSettings,
        updateMock,
        findUniqueMock,
      });

      const result = await svc.create(mockReporter, {
        category: FeedbackCategory.BUG,
        text: 'Something broke',
        route: '/play',
      });

      expect(result.githubIssueUrl).toBe('https://github.com/o/r/issues/1');
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fb-1' },
          data: expect.objectContaining({
            githubIssueUrl: 'https://github.com/o/r/issues/1',
            githubIssueNumber: 1,
          }),
        }),
      );
    });

    it('still returns saved feedback (no throw) when GitHub throws', async () => {
      const { svc } = makeService({
        rawSettings: enabledSettings,
        githubResult: new Error('GitHub down'),
      });
      const result = await svc.create(mockReporter, {
        category: FeedbackCategory.BUG,
        text: 'Test',
        route: '/',
      });
      expect(result.id).toBe('fb-1');
      expect(result.githubIssueUrl).toBeNull();
    });

    it('throws BadRequestException for oversized screenshot', async () => {
      const { svc } = makeService({});
      const bigBase64 = 'A'.repeat(CreateFeedbackDto.MAX_SCREENSHOT_BASE64_LEN + 1);
      await expect(
        svc.create(mockReporter, {
          category: FeedbackCategory.BUG,
          text: 'Test',
          route: '/',
          screenshotBase64: bigBase64,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('get', () => {
    it('throws NotFoundException when feedback does not exist', async () => {
      const { svc } = makeService({
        findUniqueMock: jest.fn().mockResolvedValue(null),
      });
      await expect(svc.get('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('throws NotFoundException when feedback does not exist', async () => {
      const { svc } = makeService({
        findUniqueMock: jest.fn().mockResolvedValue(null),
      });
      await expect(svc.updateStatus('missing-id', FeedbackStatus.CLOSED)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates and returns the updated item', async () => {
      const closed = {
        ...baseFeedbackRow,
        status: FeedbackStatus.CLOSED,
        reporter: { nickname: 'Tester' },
      };
      const { svc } = makeService({
        updateMock: jest.fn().mockResolvedValue(closed),
        findUniqueMock: jest
          .fn()
          .mockResolvedValueOnce(baseFeedbackRow) // existence check
          .mockResolvedValueOnce(closed), // get after update
      });
      const result = await svc.updateStatus('fb-1', FeedbackStatus.CLOSED);
      expect(result.status).toBe(FeedbackStatus.CLOSED);
    });
  });
});
