import { GitHubService } from './github.service';

type FetchResponse = { ok: boolean; status: number; body: object | string };

function makeFetchMock(responses: FetchResponse[]) {
  let call = 0;
  return jest.fn().mockImplementation(() => {
    const r = responses[call++];
    if (!r) throw new Error(`Unexpected fetch call #${call}`);
    return Promise.resolve({
      ok: r.ok,
      status: r.status,
      text: () => Promise.resolve(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
      json: () => Promise.resolve(r.body),
    });
  });
}

describe('GitHubService', () => {
  let svc: GitHubService;
  let origFetch: typeof global.fetch;

  beforeEach(() => {
    svc = new GitHubService();
    origFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  const baseOpts = {
    owner: 'o',
    repo: 'r',
    token: 'ghp_test',
    assetBranch: 'feedback-assets',
    feedbackId: 'fb-1',
    title: 'Bug: test',
    body: 'test body',
  };

  it('GET ref→GET repo→GET default ref→POST ref→PUT contents→POST issues (full happy path)', async () => {
    const mockFetch = makeFetchMock([
      { ok: false, status: 404, body: 'not found' }, // GET ref (branch missing)
      { ok: true, status: 200, body: { default_branch: 'main' } }, // GET repo
      { ok: true, status: 200, body: { object: { sha: 'abc123' } } }, // GET ref/heads/main
      { ok: true, status: 201, body: { ref: 'refs/heads/feedback-assets' } }, // POST git/refs
      { ok: true, status: 201, body: {} }, // PUT contents
      { ok: true, status: 201, body: { html_url: 'https://github.com/o/r/issues/42', number: 42 } }, // POST issues
    ]);
    global.fetch = mockFetch as any;

    const result = await svc.createIssueWithScreenshot({
      ...baseOpts,
      screenshotPng: Buffer.from('fakepng'),
    });

    expect(result).toEqual({ url: 'https://github.com/o/r/issues/42', number: 42 });
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it('branch already exists (GET ref → ok) — skips POST, goes to upload + issue', async () => {
    const mockFetch = makeFetchMock([
      { ok: true, status: 200, body: { object: { sha: 'abc' } } }, // GET ref (branch exists)
      { ok: true, status: 201, body: {} }, // PUT contents
      { ok: true, status: 201, body: { html_url: 'https://github.com/o/r/issues/5', number: 5 } },
    ]);
    global.fetch = mockFetch as any;

    const result = await svc.createIssueWithScreenshot({
      ...baseOpts,
      screenshotPng: Buffer.from('png'),
    });

    expect(result).toEqual({ url: 'https://github.com/o/r/issues/5', number: 5 });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('ignores 422 on branch creation (race condition — already exists)', async () => {
    const mockFetch = makeFetchMock([
      { ok: false, status: 404, body: 'not found' }, // GET ref (branch missing)
      { ok: true, status: 200, body: { default_branch: 'main' } }, // GET repo
      { ok: true, status: 200, body: { object: { sha: 'abc' } } }, // GET ref/heads/main
      { ok: false, status: 422, body: 'already exists' }, // POST git/refs → 422 (race)
      { ok: true, status: 201, body: {} }, // PUT contents
      { ok: true, status: 201, body: { html_url: 'https://github.com/o/r/issues/1', number: 1 } },
    ]);
    global.fetch = mockFetch as any;

    await expect(
      svc.createIssueWithScreenshot({ ...baseOpts, screenshotPng: Buffer.from('png') }),
    ).resolves.toEqual({ url: 'https://github.com/o/r/issues/1', number: 1 });
  });

  it('skips ensureBranch and upload when screenshotPng is null', async () => {
    const mockFetch = makeFetchMock([
      { ok: true, status: 201, body: { html_url: 'https://github.com/o/r/issues/1', number: 1 } },
    ]);
    global.fetch = mockFetch as any;

    const result = await svc.createIssueWithScreenshot({ ...baseOpts, screenshotPng: null });

    expect(result).toEqual({ url: 'https://github.com/o/r/issues/1', number: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws when POST issues fails', async () => {
    const mockFetch = makeFetchMock([{ ok: false, status: 403, body: 'forbidden' }]);
    global.fetch = mockFetch as any;

    await expect(
      svc.createIssueWithScreenshot({ ...baseOpts, screenshotPng: null }),
    ).rejects.toThrow('Failed to create issue: 403');
  });
});
