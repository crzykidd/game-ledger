import { createHash, randomBytes } from 'crypto';

/** Generate a cryptographically random token (128-bit / 32 hex chars). */
export function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

/** One-way SHA-256 hash of the raw token — stored in the DB. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
