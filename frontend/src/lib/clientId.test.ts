import { describe, it, expect, afterEach, vi } from 'vitest';
import { genClientEventId } from './clientId';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('genClientEventId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a valid v4 UUID when crypto.randomUUID is available', () => {
    expect(genClientEventId()).toMatch(UUID_RE);
  });

  it('falls back to getRandomValues when crypto.randomUUID is missing (insecure HTTP context)', () => {
    // Simulate plain-HTTP homelab: randomUUID undefined, getRandomValues present.
    const getRandomValues = (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) & 0xff;
      return arr;
    };
    vi.stubGlobal('crypto', { getRandomValues });
    const id = genClientEventId();
    expect(id).toMatch(UUID_RE);
  });

  it('produces unique ids across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => genClientEventId()));
    expect(ids.size).toBe(50);
  });
});
