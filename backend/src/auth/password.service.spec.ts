import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let svc: PasswordService;

  beforeEach(() => {
    svc = new PasswordService();
  });

  // ── Hash + verify ──────────────────────────────────────────────────────────

  it('hashes a password and verifies the same password', async () => {
    const plain = 'S3cur3Pass!word99';
    const hash = await svc.hash(plain);
    expect(hash).not.toBe(plain);
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(svc.verify(hash, plain)).resolves.toBe(true);
  });

  it('returns false for a wrong password', async () => {
    const hash = await svc.hash('CorrectPass1');
    await expect(svc.verify(hash, 'WrongPass999')).resolves.toBe(false);
  });

  it('returns false for a malformed hash', async () => {
    await expect(svc.verify('not-a-hash', 'anything')).resolves.toBe(false);
  });

  // ── Policy: accept ─────────────────────────────────────────────────────────

  it('accepts a valid password', () => {
    const result = svc.validatePolicy('SecurePass9!');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts a long password with all required chars', () => {
    const result = svc.validatePolicy('ThisIsALongPassword1');
    expect(result.valid).toBe(true);
  });

  // ── Policy: reject ─────────────────────────────────────────────────────────

  it('rejects a password shorter than 10 chars', () => {
    const result = svc.validatePolicy('Short1aB');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('10'))).toBe(true);
  });

  it('rejects a password with no uppercase letter', () => {
    const result = svc.validatePolicy('alllowercase1!');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('uppercase'))).toBe(true);
  });

  it('rejects a password with no lowercase letter', () => {
    const result = svc.validatePolicy('ALLUPPERCASE1!');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('lowercase'))).toBe(true);
  });

  it('rejects a password with no digit', () => {
    const result = svc.validatePolicy('NoDigitsHere!');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('digit'))).toBe(true);
  });

  it('accumulates multiple errors', () => {
    const result = svc.validatePolicy('short');
    expect(result.valid).toBe(false);
    // Missing: length, upper, digit
    expect(result.errors.length).toBeGreaterThan(1);
  });
});
