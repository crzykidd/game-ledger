import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';
import { FeedbackSettingsService } from './feedback-settings.service';
import { GitHubService } from './github.service';
import { CreateFeedbackDto } from './create-feedback.dto';
import type { FeedbackItem, CreateFeedbackResponse } from '@game-ledger/contract';
import { FeedbackStatus } from '@game-ledger/contract';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: FeedbackSettingsService,
    private readonly githubService: GitHubService,
  ) {}

  async create(reporter: User, dto: CreateFeedbackDto): Promise<CreateFeedbackResponse> {
    if (
      dto.screenshotBase64 &&
      dto.screenshotBase64.length > CreateFeedbackDto.MAX_SCREENSHOT_BASE64_LEN
    ) {
      throw new BadRequestException('Screenshot exceeds the 2 MB size limit.');
    }

    const screenshotBytes = dto.screenshotBase64
      ? Buffer.from(dto.screenshotBase64, 'base64')
      : null;

    // Save the row first — always succeeds regardless of GitHub.
    const feedback = await this.prisma.feedback.create({
      data: {
        reporterUserId: reporter.id,
        route: dto.route,
        moduleKey: dto.moduleKey ?? null,
        moduleMaturity: dto.moduleMaturity ?? null,
        category: dto.category,
        text: dto.text,
        screenshot: screenshotBytes,
        screenshotMime: screenshotBytes ? 'image/png' : null,
        status: FeedbackStatus.OPEN,
      },
    });

    let githubIssueUrl: string | null = null;

    // Best-effort: GitHub issue creation never fails the save.
    try {
      const settings = await this.settingsService.getRawSettings();
      if (
        settings.githubEnabled &&
        settings.githubToken &&
        settings.githubRepoOwner &&
        settings.githubRepoName
      ) {
        const categoryLabel = dto.category.charAt(0) + dto.category.slice(1).toLowerCase();
        const truncated = dto.text.length > 60 ? dto.text.slice(0, 60) + '...' : dto.text;
        const title = `[${categoryLabel}] ${truncated}`;
        const body = this.buildIssueBody(dto, reporter);

        const result = await this.githubService.createIssueWithScreenshot({
          owner: settings.githubRepoOwner,
          repo: settings.githubRepoName,
          token: settings.githubToken,
          assetBranch: settings.githubAssetBranch,
          feedbackId: feedback.id,
          title,
          body,
          screenshotPng: screenshotBytes,
        });

        await this.prisma.feedback.update({
          where: { id: feedback.id },
          data: { githubIssueUrl: result.url, githubIssueNumber: result.number },
        });

        githubIssueUrl = result.url;
      }
    } catch (err) {
      this.logger.error(
        `Best-effort GitHub issue creation failed for feedback ${feedback.id}`,
        err,
      );
    }

    return { id: feedback.id, githubIssueUrl };
  }

  async list(): Promise<FeedbackItem[]> {
    const rows = await this.prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      include: { reporter: { select: { nickname: true } } },
    });
    return rows.map((r) => this.toItem(r));
  }

  async get(id: string): Promise<FeedbackItem> {
    const r = await this.prisma.feedback.findUnique({
      where: { id },
      include: { reporter: { select: { nickname: true } } },
    });
    if (!r) throw new NotFoundException(`Feedback ${id} not found`);
    return this.toItem(r);
  }

  async getScreenshot(id: string): Promise<{ data: Buffer; mime: string }> {
    const r = await this.prisma.feedback.findUnique({
      where: { id },
      select: { screenshot: true, screenshotMime: true },
    });
    if (!r) throw new NotFoundException(`Feedback ${id} not found`);
    if (!r.screenshot) throw new NotFoundException(`Feedback ${id} has no screenshot`);
    return { data: Buffer.from(r.screenshot), mime: r.screenshotMime ?? 'image/png' };
  }

  async updateStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem> {
    const existing = await this.prisma.feedback.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Feedback ${id} not found`);
    await this.prisma.feedback.update({ where: { id }, data: { status } });
    return this.get(id);
  }

  private toItem(r: {
    id: string;
    reporterUserId: string;
    reporter: { nickname: string };
    route: string;
    moduleKey: string | null;
    moduleMaturity: string | null;
    category: string;
    text: string;
    screenshot: Buffer | Uint8Array | null;
    githubIssueUrl: string | null;
    githubIssueNumber: number | null;
    status: string;
    createdAt: Date;
  }): FeedbackItem {
    return {
      id: r.id,
      reporterUserId: r.reporterUserId,
      reporterNickname: r.reporter.nickname,
      route: r.route,
      moduleKey: r.moduleKey,
      moduleMaturity: r.moduleMaturity,
      category: r.category as FeedbackItem['category'],
      text: r.text,
      hasScreenshot: r.screenshot !== null,
      githubIssueUrl: r.githubIssueUrl,
      githubIssueNumber: r.githubIssueNumber,
      status: r.status as FeedbackItem['status'],
      createdAt: r.createdAt.toISOString(),
    };
  }

  private buildIssueBody(dto: CreateFeedbackDto, reporter: User): string {
    const lines = [
      dto.text,
      '',
      '---',
      `**Reporter:** ${reporter.nickname}`,
      `**Route:** \`${dto.route}\``,
    ];
    if (dto.moduleKey) lines.push(`**Module:** \`${dto.moduleKey}\``);
    if (dto.moduleMaturity) lines.push(`**Maturity:** ${dto.moduleMaturity}`);
    return lines.join('\n');
  }
}
