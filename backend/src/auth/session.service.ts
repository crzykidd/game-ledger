import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Session, User } from '@prisma/client';

/**
 * Session lifetime defaults.
 *
 * Decision: 7-day default (mobile-first, "stay logged in" matters).
 * The session secret and lifetime can be overridden via env.
 */
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionWithUser extends Session {
  user: User;
}

@Injectable()
export class SessionService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.ttlMs = parseInt(this.config.get('SESSION_TTL_MS') ?? String(DEFAULT_SESSION_TTL_MS), 10);
  }

  /** Generate a cryptographically random token (128-bit / 32 hex chars). */
  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /** One-way SHA-256 hash of the raw token — stored in the DB. */
  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Create a new session. Returns the raw (unhashed) token that goes in the cookie.
   * The DB stores only the hash.
   */
  async createSession(
    userId: string,
    opts?: { userAgent?: string; ipAddress?: string },
  ): Promise<{ rawToken: string; session: Session }> {
    const rawToken = this.generateToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.ttlMs);

    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        userAgent: opts?.userAgent,
        ipAddress: opts?.ipAddress,
      },
    });

    return { rawToken, session };
  }

  /**
   * Validate a raw session token from the cookie.
   * Returns the session+user or null if invalid/expired/revoked.
   */
  async validateSession(rawToken: string): Promise<SessionWithUser | null> {
    const tokenHash = this.hashToken(rawToken);

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt < new Date()) return null;

    return session as SessionWithUser;
  }

  /** Revoke a single session by its raw token. */
  async revokeSession(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Revoke all sessions for a user (logout all devices). */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
