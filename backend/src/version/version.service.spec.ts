import { VersionService } from './version.service';

describe('VersionService', () => {
  let service: VersionService;

  beforeEach(() => {
    service = new VersionService();
  });

  it('should be instantiated', () => {
    expect(service).toBeDefined();
  });

  it('getVersion() returns a non-empty string', () => {
    const version = service.getVersion();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });

  it('getVersion() returns a semver-shaped string or "unknown"', () => {
    const version = service.getVersion();
    const isSemver = /^\d+\.\d+\.\d+/.test(version);
    const isUnknown = version === 'unknown';
    expect(isSemver || isUnknown).toBe(true);
  });

  it('getVersion() returns the same value on repeated calls (idempotent)', () => {
    const v1 = service.getVersion();
    const v2 = service.getVersion();
    expect(v1).toBe(v2);
  });
});
