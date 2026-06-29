import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';

/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * Design:
 *  - Server generates a CSRF token = HMAC-SHA256(sessionId, csrfSecret) + "." + random
 *  - Token is sent to the client as a non-httpOnly cookie (readable by JS)
 *    AND expected as the X-CSRF-Token header on state-changing requests.
 *  - Because the cookie is bound to the origin (SameSite=Lax), a cross-site
 *    attacker cannot read it to replay it in the header.
 *
 * For SameSite=Lax + httpOnly session cookies, cross-origin POST is already
 * blocked for most cases; this adds defence-in-depth.
 */
@Injectable()
export class CsrfService {
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.get('SESSION_SECRET') ?? 'csrf-fallback-secret';
  }

  /** Generate a CSRF token tied to a session id. */
  generateToken(sessionId: string): string {
    const random = randomBytes(16).toString('hex');
    const mac = createHmac('sha256', this.secret).update(`${sessionId}:${random}`).digest('hex');
    return `${random}.${mac}`;
  }

  /** Validate that a CSRF token is consistent with its claimed session id. */
  validateToken(sessionId: string, token: string): boolean {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [random, mac] = parts;
    const expectedMac = createHmac('sha256', this.secret)
      .update(`${sessionId}:${random}`)
      .digest('hex');
    // Constant-time compare.
    return timingSafeEqual(expectedMac, mac);
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
