import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../auth/password.service';
import { AuditService } from '../audit/audit.service';
import { generateRawToken, hashToken } from '../common/token.util';
import { TokenType, TokenStatus, UserState, Role } from '@game-ledger/contract';
import { CreateInviteDto, AcceptInviteDto } from './invites.dto';

/** Invite token TTL: 24 hours. */
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class InvitesService {
  private readonly appBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {
    this.appBaseUrl = this.config.get('APP_BASE_URL') ?? 'http://localhost:5173';
  }

  /** POST /api/invites — create an invite, optionally bound to a guest Player. */
  async createInvite(dto: CreateInviteDto, createdById: string) {
    const email = dto.email.toLowerCase().trim();

    // If guestPlayerId is given, verify it exists and has no userId.
    if (dto.guestPlayerId) {
      const guest = await this.prisma.player.findUnique({ where: { id: dto.guestPlayerId } });
      if (!guest) throw new NotFoundException(`Guest player ${dto.guestPlayerId} not found.`);
      if (guest.userId) {
        throw new ConflictException('This guest player is already linked to a user account.');
      }
    }

    const rawToken = generateRawToken();
    const tHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const token = await this.prisma.token.create({
      data: {
        type: TokenType.INVITE,
        tokenHash: tHash,
        targetEmail: email,
        targetGuestPlayerId: dto.guestPlayerId ?? null,
        createdById,
        expiresAt,
        status: TokenStatus.PENDING,
      },
    });

    await this.auditService.write({
      actorUserId: createdById,
      action: 'invite.created',
      targetType: 'token',
      targetId: token.id,
      metadata: { email, guestPlayerId: dto.guestPlayerId ?? null },
    });

    const link = `${this.appBaseUrl}/invite/accept/${rawToken}`;
    return {
      id: token.id,
      email,
      expiresAt: token.expiresAt,
      link,
    };
  }

  /** GET /api/invites — list invites with derived status. */
  async listInvites() {
    const tokens = await this.prisma.token.findMany({
      where: { type: TokenType.INVITE },
      include: {
        createdBy: { select: { id: true, nickname: true } },
        targetGuest: { select: { id: true, nickname: true } },
        targetUser: { select: { id: true, nickname: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    return tokens.map((t) => ({
      id: t.id,
      email: t.targetEmail,
      status: this.deriveStatus(t, now),
      createdBy: t.createdBy,
      guestPlayer: t.targetGuest,
      claimedByUser: t.targetUser,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      consumedAt: t.consumedAt,
    }));
  }

  /** POST /api/invites/:id/revoke */
  async revokeInvite(id: string, actorUserId: string) {
    const token = await this.findTokenById(id, TokenType.INVITE);
    if (token.status === TokenStatus.REVOKED) {
      throw new BadRequestException('Invite is already revoked.');
    }
    if (token.status === TokenStatus.CONSUMED) {
      throw new BadRequestException('Cannot revoke a consumed invite.');
    }

    await this.prisma.token.update({
      where: { id },
      data: { status: TokenStatus.REVOKED },
    });

    await this.auditService.write({
      actorUserId,
      action: 'invite.revoked',
      targetType: 'token',
      targetId: id,
    });
  }

  /** POST /api/invites/:id/regenerate — revoke old + create fresh token. */
  async regenerateInvite(id: string, actorUserId: string) {
    const token = await this.findTokenById(id, TokenType.INVITE);
    if (token.status === TokenStatus.CONSUMED) {
      throw new BadRequestException('Cannot regenerate a consumed invite.');
    }

    // Revoke old.
    await this.prisma.token.update({
      where: { id },
      data: { status: TokenStatus.REVOKED },
    });

    // Create new with same email/guest.
    return this.createInvite(
      {
        email: token.targetEmail!,
        guestPlayerId: token.targetGuestPlayerId ?? undefined,
      },
      actorUserId,
    ).then(async (result) => {
      await this.auditService.write({
        actorUserId,
        action: 'invite.regenerated',
        targetType: 'token',
        targetId: id,
        metadata: { newTokenId: result.id },
      });
      return result;
    });
  }

  /** GET /api/invites/accept/:token — validate and return pre-fill. */
  async validateAcceptToken(rawToken: string) {
    const token = await this.findTokenByRaw(rawToken, TokenType.INVITE);
    this.assertTokenUsable(token);

    let guestNickname: string | null = null;
    if (token.targetGuestPlayerId) {
      const guest = await this.prisma.player.findUnique({
        where: { id: token.targetGuestPlayerId },
        select: { nickname: true },
      });
      guestNickname = guest?.nickname ?? null;
    }

    return {
      email: token.targetEmail,
      suggestedNickname: guestNickname,
      expiresAt: token.expiresAt,
    };
  }

  /** POST /api/invites/accept/:token — create user, link guest, consume token. */
  async acceptInvite(rawToken: string, dto: AcceptInviteDto) {
    const token = await this.findTokenByRaw(rawToken, TokenType.INVITE);
    this.assertTokenUsable(token);

    const email = token.targetEmail!.toLowerCase().trim();

    // Check email uniqueness — 409 with helpful message if already in use.
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('That email is already in use — did you forget your password?');
    }

    // Validate password policy.
    const policyResult = this.passwordService.validatePolicy(dto.password);
    if (!policyResult.valid) {
      throw new BadRequestException(policyResult.errors.join(' '));
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    // Transactionally: create user, link guest player, consume token.
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          fullName: dto.fullName,
          nickname: dto.nickname,
          passwordHash,
          role: Role.PLAYER,
          state: UserState.ACTIVE,
        },
      });

      // Link guest player if the invite was bound to one.
      if (token.targetGuestPlayerId) {
        await tx.player.update({
          where: { id: token.targetGuestPlayerId },
          data: { userId: newUser.id },
        });
      } else {
        // No guest was bound — create a self-Player so the user appears in the roster.
        await tx.player.create({
          data: {
            nickname: dto.nickname,
            userId: newUser.id,
            createdById: newUser.id,
          },
        });
      }

      // Also update the token's targetUserId for the invite list view.
      await tx.token.update({
        where: { id: token.id },
        data: {
          status: TokenStatus.CONSUMED,
          consumedAt: new Date(),
          targetUserId: newUser.id,
        },
      });

      return newUser;
    });

    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async findTokenById(id: string, type: TokenType) {
    const token = await this.prisma.token.findFirst({ where: { id, type } });
    if (!token) throw new NotFoundException(`Invite ${id} not found.`);
    return token;
  }

  private async findTokenByRaw(rawToken: string, type: TokenType) {
    const tHash = hashToken(rawToken);
    const token = await this.prisma.token.findFirst({ where: { tokenHash: tHash, type } });
    if (!token) throw new NotFoundException('Token not found.');
    return token;
  }

  private assertTokenUsable(token: { status: string; expiresAt: Date }) {
    if (token.status === TokenStatus.CONSUMED) {
      throw new GoneException('This token has already been used.');
    }
    if (token.status === TokenStatus.REVOKED) {
      throw new GoneException('This token has been revoked.');
    }
    if (token.expiresAt < new Date()) {
      throw new GoneException('This token has expired.');
    }
  }

  private deriveStatus(token: { status: string; expiresAt: Date }, now: Date): string {
    if (token.status === TokenStatus.CONSUMED) return 'claimed';
    if (token.status === TokenStatus.REVOKED) return 'revoked';
    if (token.expiresAt < now) return 'expired';
    return 'pending';
  }
}
