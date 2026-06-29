import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

/** argon2id options — tuned for interactive login (OWASP recommended baseline). */
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  /** Hash a plaintext password with argon2id. */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /** Verify a plaintext password against a stored hash. */
  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Validate a plaintext password against the policy:
   *   - At least 10 characters
   *   - At least one uppercase letter
   *   - At least one lowercase letter
   *   - At least one digit
   *
   * Hook: add breach-list / zxcvbn strength check here when desired.
   */
  validatePolicy(password: string): PasswordPolicyResult {
    const errors: string[] = [];

    if (password.length < 10) {
      errors.push('Password must be at least 10 characters long.');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter.');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter.');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one digit.');
    }

    return { valid: errors.length === 0, errors };
  }
}
