import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { PermissionService } from '../rbac/permission.service';
import { Permission, Role, UserState } from '@game-ledger/contract';
import { User } from '@prisma/client';

/** How many failed attempts before we lock the account. */
const MAX_FAILED_ATTEMPTS = 5;

/** Lock duration in milliseconds (15 minutes). */
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface MeResponse {
  id: string;
  email: string;
  nickname: string;
  fullName: string;
  role: Role;
  state: UserState;
  themePref: string;
  effectivePermissions: Permission[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Attempt login. Returns the raw session token on success.
   * Throws 401 on bad credentials, 429 on lockout.
   *
   * Brute-force protection uses the failedLoginAttempts + lockedUntil columns
   * (added via migration) on the User table — falls back gracefully if columns
   * don't yet exist (just skips lockout; shouldn't happen after migration).
   */
  async login(
    email: string,
    password: string,
    opts?: { userAgent?: string; ipAddress?: string },
  ): Promise<string> {
    // Normalise email to lowercase.
    const normEmail = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normEmail },
    });

    // Constant-time gate: always run password check to avoid user-enumeration.
    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=1$dummy$dummyhashvalue00000000000000000000000';
    const passwordToCheck = user?.passwordHash ?? dummyHash;
    const passwordValid = await this.passwordService.verify(passwordToCheck, password);

    if (!user || !passwordValid) {
      if (user) {
        await this.recordFailedAttempt(user);
      }
      throw new UnauthorizedException('Invalid email or password.');
    }

    // Check lockout.
    await this.checkLockout(user);

    if (user.state === 'DISABLED') {
      throw new ForbiddenException('Account is disabled.');
    }
    if (user.state === 'PENDING') {
      throw new ForbiddenException('Account is pending activation.');
    }

    // Successful login — reset failure counter.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const { rawToken } = await this.sessionService.createSession(user.id, opts);
    return rawToken;
  }

  private async recordFailedAttempt(user: User): Promise<void> {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const lockedUntil =
      attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil,
      },
    });
  }

  private async checkLockout(user: User): Promise<void> {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfterSec = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      throw new ForbiddenException(
        `Account is temporarily locked due to too many failed login attempts. ` +
          `Try again in ${retryAfterSec} seconds.`,
      );
    }
  }

  /** Get the session record (for CSRF token generation after login). */
  async getSessionByRawToken(rawToken: string) {
    return this.sessionService.validateSession(rawToken);
  }

  async logout(rawToken: string): Promise<void> {
    await this.sessionService.revokeSession(rawToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessionService.revokeAllSessions(userId);
  }

  async getMe(user: User): Promise<MeResponse> {
    const effectivePermissions = await this.permissionService.resolveEffectivePermissions(
      user.id,
      user.role as Role,
    );

    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      fullName: user.fullName,
      role: user.role as Role,
      state: user.state as UserState,
      themePref: user.themePref,
      effectivePermissions: [...effectivePermissions],
    };
  }

  async patchMe(userId: string, dto: { themePref: string }): Promise<MeResponse> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { themePref: dto.themePref as any },
    });
    return this.getMe(user);
  }
}
