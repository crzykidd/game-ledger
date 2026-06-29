import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, PatchMeDto } from './auth.dto';
import { AuthGuard, SESSION_COOKIE } from '../rbac/auth.guard';
import { CurrentUser } from '../rbac/current-user.decorator';
import { CsrfService } from './csrf.service';
import { CSRF_COOKIE, CsrfGuard } from './csrf.guard';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Session } from '@prisma/client';

@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly csrfService: CsrfService,
    private readonly config: ConfigService,
  ) {
    this.isProduction = this.config.get('NODE_ENV') === 'production';
  }

  /** POST /api/auth/login */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = await this.authService.login(dto.email, dto.password, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    // Validate the session to get the session id for CSRF.
    const sessionWithUser = await this.authService.getSessionByRawToken(rawToken);

    this.setSessionCookie(res, rawToken);

    if (sessionWithUser) {
      const csrfToken = this.csrfService.generateToken(sessionWithUser.id);
      this.setCsrfCookie(res, csrfToken);
    }

    return { message: 'Logged in.' };
  }

  /** POST /api/auth/logout */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = (req as any).rawSessionToken as string;
    await this.authService.logout(rawToken);
    this.clearSessionCookie(res);
    this.clearCsrfCookie(res);
    return { message: 'Logged out.' };
  }

  /** POST /api/auth/logout-all */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async logoutAll(@CurrentUser() user: User, @Res({ passthrough: true }) res: Response) {
    await this.authService.logoutAll(user.id);
    this.clearSessionCookie(res);
    this.clearCsrfCookie(res);
    return { message: 'All sessions revoked.' };
  }

  /** GET /api/auth/me — also refreshes the CSRF cookie. */
  @Get('me')
  @UseGuards(AuthGuard)
  async me(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = (req as any).session as Session;
    const csrfToken = this.csrfService.generateToken(session.id);
    this.setCsrfCookie(res, csrfToken);
    return this.authService.getMe(user);
  }

  /** PATCH /api/auth/me — update current user's theme preference. */
  @Patch('me')
  @UseGuards(AuthGuard, CsrfGuard)
  async patchMe(
    @CurrentUser() user: User,
    @Body() dto: PatchMeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = (req as any).session as Session;
    const csrfToken = this.csrfService.generateToken(session.id);
    this.setCsrfCookie(res, csrfToken);
    return this.authService.patchMe(user.id, dto);
  }

  private setSessionCookie(res: Response, rawToken: string): void {
    res.cookie(SESSION_COOKIE, rawToken, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: '/',
      // 7-day TTL matches session lifetime
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private setCsrfCookie(res: Response, token: string): void {
    // NOT httpOnly — JS must be able to read it to send X-CSRF-Token header.
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: this.isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearSessionCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  private clearCsrfCookie(res: Response): void {
    res.clearCookie(CSRF_COOKIE, { path: '/' });
  }
}
