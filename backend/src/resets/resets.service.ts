import { Injectable, NotFoundException, BadRequestException, GoneException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { AuditService } from '../audit/audit.service';
import { generateRawToken, hashToken } from '../common/token.util';
import { TokenType, TokenStatus } from '@game-ledger/contract';
import { ConsumeResetDto } from './resets.dto';

/** Reset token TTL: 24 hours. */
const RESET_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ResetsService {
  private readonly appBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {
    this.appBaseUrl = this.config.get('APP_BASE_URL') ?? 'http://localhost:5173';
  }

  /** POST /api/users/:id/reset-link — issue a password-reset link. */
  async createResetLink(targetUserId: string, actorUserId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException(`User ${targetUserId} not found.`);

    const rawToken = generateRawToken();
    const tHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    const token = await this.prisma.token.create({
      data: {
        type: TokenType.PASSWORD_RESET,
        tokenHash: tHash,
        targetUserId,
        createdById: actorUserId,
        expiresAt,
        status: TokenStatus.PENDING,
      },
    });

    await this.auditService.write({
      actorUserId,
      action: 'reset.issued',
      targetType: 'user',
      targetId: targetUserId,
      metadata: { tokenId: token.id },
    });

    const link = `${this.appBaseUrl}/reset/${rawToken}`;
    return {
      id: token.id,
      targetUserId,
      expiresAt: token.expiresAt,
      link,
    };
  }

  /** GET /api/resets — list reset links with claimed status. */
  async listResets() {
    const tokens = await this.prisma.token.findMany({
      where: { type: TokenType.PASSWORD_RESET },
      include: {
        createdBy: { select: { id: true, nickname: true } },
        targetUser: { select: { id: true, nickname: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return tokens.map((t) => ({
      id: t.id,
      target: t.targetUser,
      claimed: t.status === TokenStatus.CONSUMED,
      status: this.deriveStatus(t, now),
      createdBy: t.createdBy,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      consumedAt: t.consumedAt,
    }));
  }

  /** GET /api/resets/:token — validate a reset token. */
  async validateResetToken(rawToken: string) {
    const token = await this.findTokenByRaw(rawToken);
    this.assertTokenUsable(token);

    const target = await this.prisma.user.findUnique({
      where: { id: token.targetUserId! },
      select: { id: true, email: true, nickname: true },
    });

    return {
      targetUser: target,
      expiresAt: token.expiresAt,
    };
  }

  /** POST /api/resets/:token — consume the token and set the new password. */
  async consumeResetToken(rawToken: string, dto: ConsumeResetDto) {
    const token = await this.findTokenByRaw(rawToken);
    this.assertTokenUsable(token);

    // Validate password policy.
    const policyResult = this.passwordService.validatePolicy(dto.password);
    if (!policyResult.valid) {
      throw new BadRequestException(policyResult.errors.join(' '));
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const userId = token.targetUserId!;

    await this.prisma.$transaction(async (tx) => {
      // Update password.
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      // Revoke all existing sessions (force re-login after reset).
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Consume this token.
      await tx.token.update({
        where: { id: token.id },
        data: { status: TokenStatus.CONSUMED, consumedAt: new Date() },
      });
    });

    await this.auditService.write({
      actorUserId: userId,
      action: 'reset.consumed',
      targetType: 'user',
      targetId: userId,
      metadata: { tokenId: token.id },
    });

    return { message: 'Password reset successful. All sessions have been revoked.' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async findTokenByRaw(rawToken: string) {
    const tHash = hashToken(rawToken);
    const token = await this.prisma.token.findFirst({
      where: { tokenHash: tHash, type: TokenType.PASSWORD_RESET },
    });
    if (!token) throw new NotFoundException('Reset token not found.');
    return token;
  }

  private assertTokenUsable(token: { status: string; expiresAt: Date }) {
    if (token.status === TokenStatus.CONSUMED) {
      throw new GoneException('This reset link has already been used.');
    }
    if (token.status === TokenStatus.REVOKED) {
      throw new GoneException('This reset link has been revoked.');
    }
    if (token.expiresAt < new Date()) {
      throw new GoneException('This reset link has expired.');
    }
  }

  private deriveStatus(token: { status: string; expiresAt: Date }, now: Date): string {
    if (token.status === TokenStatus.CONSUMED) return 'claimed';
    if (token.status === TokenStatus.REVOKED) return 'revoked';
    if (token.expiresAt < now) return 'expired';
    return 'pending';
  }
}
