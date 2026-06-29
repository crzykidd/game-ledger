import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { FeedbackSettings, UpdateFeedbackSettingsBody } from '@game-ledger/contract';

@Injectable()
export class FeedbackSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Read singleton settings. Returns safe DTO — token is never included. */
  async getSettings(): Promise<FeedbackSettings> {
    const row = await this.prisma.feedbackSetting.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    return this.toDto(row);
  }

  /** Update settings. SUPER_ADMIN-only (enforced in controller). */
  async updateSettings(body: UpdateFeedbackSettingsBody): Promise<FeedbackSettings> {
    const data: Record<string, unknown> = {};
    if (body.githubEnabled !== undefined) data.githubEnabled = body.githubEnabled;
    if (body.githubRepoOwner !== undefined) data.githubRepoOwner = body.githubRepoOwner;
    if (body.githubRepoName !== undefined) data.githubRepoName = body.githubRepoName;
    if (body.githubAssetBranch !== undefined) data.githubAssetBranch = body.githubAssetBranch;
    if (body.githubToken !== undefined) data.githubToken = body.githubToken;

    const row = await this.prisma.feedbackSetting.upsert({
      where: { id: 1 },
      create: { id: 1, ...data },
      update: data,
    });
    return this.toDto(row);
  }

  /** Get the raw settings row including token (internal use by FeedbackService). */
  async getRawSettings() {
    return this.prisma.feedbackSetting.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
  }

  private toDto(row: {
    githubEnabled: boolean;
    githubRepoOwner: string | null;
    githubRepoName: string | null;
    githubAssetBranch: string;
    githubToken: string | null;
    updatedAt: Date;
  }): FeedbackSettings {
    return {
      githubEnabled: row.githubEnabled,
      githubRepoOwner: row.githubRepoOwner,
      githubRepoName: row.githubRepoName,
      githubAssetBranch: row.githubAssetBranch,
      githubTokenSet: row.githubToken != null && row.githubToken.length > 0,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
