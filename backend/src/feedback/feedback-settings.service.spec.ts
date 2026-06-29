import { FeedbackSettingsService } from './feedback-settings.service';
import { PrismaService } from '../prisma/prisma.service';

const baseRow = {
  id: 1,
  githubEnabled: false,
  githubRepoOwner: null,
  githubRepoName: null,
  githubAssetBranch: 'feedback-assets',
  githubToken: null,
  createdAt: new Date(),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function makeService(upsertReturn: object = baseRow) {
  const prisma = {
    feedbackSetting: {
      upsert: jest.fn().mockResolvedValue(upsertReturn),
    },
  } as unknown as PrismaService;
  return { svc: new FeedbackSettingsService(prisma), prisma };
}

describe('FeedbackSettingsService', () => {
  it('getSettings returns githubTokenSet: false when no token stored', async () => {
    const { svc } = makeService();
    const settings = await svc.getSettings();
    expect(settings.githubTokenSet).toBe(false);
    expect((settings as any).githubToken).toBeUndefined();
  });

  it('getSettings returns githubTokenSet: true when token is stored', async () => {
    const { svc } = makeService({ ...baseRow, githubToken: 'ghp_abc123' });
    const settings = await svc.getSettings();
    expect(settings.githubTokenSet).toBe(true);
    expect((settings as any).githubToken).toBeUndefined();
  });

  it('getSettings never returns the token value', async () => {
    const { svc } = makeService({ ...baseRow, githubToken: 'super-secret' });
    const settings = await svc.getSettings();
    const json = JSON.stringify(settings);
    expect(json).not.toContain('super-secret');
  });

  it('updateSettings passes token to prisma upsert', async () => {
    const withToken = { ...baseRow, githubToken: 'ghp_newtoken' };
    const { svc, prisma } = makeService(withToken);
    const settings = await svc.updateSettings({ githubToken: 'ghp_newtoken' });
    expect((prisma.feedbackSetting.upsert as jest.Mock).mock.calls[0][0].update).toMatchObject({
      githubToken: 'ghp_newtoken',
    });
    // Response must not expose the token.
    expect(settings.githubTokenSet).toBe(true);
    expect((settings as any).githubToken).toBeUndefined();
  });

  it('updateSettings only sends provided fields', async () => {
    const { svc, prisma } = makeService();
    await svc.updateSettings({ githubEnabled: true });
    const updateArg = (prisma.feedbackSetting.upsert as jest.Mock).mock.calls[0][0].update;
    expect(updateArg).toEqual({ githubEnabled: true });
    expect(updateArg).not.toHaveProperty('githubToken');
  });
});
