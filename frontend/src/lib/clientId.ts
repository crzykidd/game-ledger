/**
 * Generate a UUID for a clientEventId.
 *
 * `crypto.randomUUID()` exists ONLY in a secure context (HTTPS or localhost). This app
 * is served over plain HTTP in the homelab (e.g. http://host.home.arpa:8088), where
 * `crypto.randomUUID` is undefined and calling it throws — which silently killed score
 * saves. Fall back to a `getRandomValues`-based UUID v4, which is available in insecure
 * contexts too (only `crypto.randomUUID`/`crypto.subtle` require a secure context).
 */
export function genClientEventId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
}
