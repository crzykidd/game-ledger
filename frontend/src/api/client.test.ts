import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiClient, ApiClientError } from './client';

const BASE_RESPONSE = { ok: true, status: 200, json: async () => ({ data: 'ok' }) };

function makeFetchMock(response: Partial<Response & { json: () => Promise<unknown> }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({}),
    ...response,
  });
}

describe('ApiClient', () => {
  let client: ApiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new ApiClient();
    fetchMock = makeFetchMock(
      BASE_RESPONSE as Partial<Response & { json: () => Promise<unknown> }>,
    );
    vi.stubGlobal('fetch', fetchMock);
    // Clear cookies
    document.cookie = 'gl_csrf=; max-age=0';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET does not inject X-CSRF-Token header', async () => {
    await client.get('/api/test');
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string> | undefined;
    expect(headers?.['X-CSRF-Token']).toBeUndefined();
    expect((options as RequestInit).method).toBe('GET');
  });

  it('POST injects X-CSRF-Token header from gl_csrf cookie', async () => {
    document.cookie = 'gl_csrf=test-csrf-value';
    await client.post('/api/test', { foo: 'bar' });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('test-csrf-value');
  });

  it('POST sends credentials: include', async () => {
    await client.post('/api/test');
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe('include');
  });

  it('GET sends credentials: include', async () => {
    await client.get('/api/test');
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe('include');
  });

  it('PATCH injects X-CSRF-Token header', async () => {
    document.cookie = 'gl_csrf=patch-csrf';
    await client.patch('/api/test', { key: 'val' });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('patch-csrf');
  });

  it('throws ApiClientError on non-ok response', async () => {
    const errorBody = { statusCode: 401, message: 'Unauthorized' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => errorBody,
      }),
    );

    await expect(client.get('/api/me')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('ApiClientError carries statusCode and message', async () => {
    const errorBody = { statusCode: 403, message: 'Forbidden access' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => errorBody,
      }),
    );

    let caught: ApiClientError | null = null;
    try {
      await client.post('/api/action');
    } catch (e) {
      caught = e as ApiClientError;
    }
    expect(caught).not.toBeNull();
    expect(caught!.error.statusCode).toBe(403);
    expect(caught!.error.message).toBe('Forbidden access');
  });
});
