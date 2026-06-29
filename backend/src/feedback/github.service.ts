import { Injectable, Logger } from '@nestjs/common';

export interface CreateIssueOptions {
  owner: string;
  repo: string;
  token: string;
  assetBranch: string;
  feedbackId: string;
  title: string;
  body: string;
  screenshotPng: Buffer | null;
}

export interface CreateIssueResult {
  url: string;
  number: number;
}

@Injectable()
export class GitHubService {
  private readonly logger = new Logger(GitHubService.name);
  private readonly apiBase = 'https://api.github.com';

  /**
   * Create a GitHub issue, optionally uploading a screenshot to the asset branch.
   *
   * When a screenshot is provided:
   *  1. Ensure the asset branch exists (lazy, ignores 422 = already exists).
   *  2. PUT the PNG to /contents/feedback/{id}.png on that branch.
   *  3. POST the issue embedding the raw.githubusercontent.com URL.
   *
   * Throws on failures so the caller can catch for best-effort behavior.
   */
  async createIssueWithScreenshot(opts: CreateIssueOptions): Promise<CreateIssueResult> {
    const { owner, repo, token, assetBranch, feedbackId, title, body, screenshotPng } = opts;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    let screenshotUrl: string | null = null;

    if (screenshotPng) {
      await this.ensureBranch({ owner, repo, headers, branchName: assetBranch });
      screenshotUrl = await this.uploadScreenshot({
        owner,
        repo,
        headers,
        assetBranch,
        feedbackId,
        screenshotPng,
      });
    }

    const issueBody = this.buildIssueBody(body, screenshotUrl);
    return this.postIssue({ owner, repo, headers, title, body: issueBody });
  }

  private async ensureBranch(opts: {
    owner: string;
    repo: string;
    headers: Record<string, string>;
    branchName: string;
  }): Promise<void> {
    const { owner, repo, headers, branchName } = opts;

    const refRes = await fetch(
      `${this.apiBase}/repos/${owner}/${repo}/git/ref/heads/${branchName}`,
      { headers },
    );

    if (refRes.ok) return;

    if (refRes.status !== 404) {
      const text = await refRes.text();
      throw new Error(`Failed to check branch: ${refRes.status} ${text}`);
    }

    // Get default branch sha to use as the branch point.
    const repoRes = await fetch(`${this.apiBase}/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      const text = await repoRes.text();
      throw new Error(`Failed to get repo info: ${repoRes.status} ${text}`);
    }
    const repoData = (await repoRes.json()) as { default_branch: string };

    const defaultRefRes = await fetch(
      `${this.apiBase}/repos/${owner}/${repo}/git/ref/heads/${repoData.default_branch}`,
      { headers },
    );
    if (!defaultRefRes.ok) {
      const text = await defaultRefRes.text();
      throw new Error(`Failed to get default branch ref: ${defaultRefRes.status} ${text}`);
    }
    const defaultRefData = (await defaultRefRes.json()) as { object: { sha: string } };
    const sha = defaultRefData.object.sha;

    const createRes = await fetch(`${this.apiBase}/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
    });

    // 422 = already exists (race) — treat as success.
    if (!createRes.ok && createRes.status !== 422) {
      const text = await createRes.text();
      throw new Error(`Failed to create branch: ${createRes.status} ${text}`);
    }
  }

  private async uploadScreenshot(opts: {
    owner: string;
    repo: string;
    headers: Record<string, string>;
    assetBranch: string;
    feedbackId: string;
    screenshotPng: Buffer;
  }): Promise<string> {
    const { owner, repo, headers, assetBranch, feedbackId, screenshotPng } = opts;
    const filePath = `feedback/${feedbackId}.png`;

    const putRes = await fetch(`${this.apiBase}/repos/${owner}/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `chore: add feedback screenshot ${feedbackId}`,
        content: screenshotPng.toString('base64'),
        branch: assetBranch,
      }),
    });

    if (!putRes.ok) {
      const text = await putRes.text();
      throw new Error(`Failed to upload screenshot: ${putRes.status} ${text}`);
    }

    return `https://raw.githubusercontent.com/${owner}/${repo}/${assetBranch}/${filePath}`;
  }

  private buildIssueBody(userText: string, screenshotUrl: string | null): string {
    const parts: string[] = [userText];
    if (screenshotUrl) {
      parts.push(`\n![screenshot](${screenshotUrl})`);
    }
    return parts.join('\n');
  }

  private async postIssue(opts: {
    owner: string;
    repo: string;
    headers: Record<string, string>;
    title: string;
    body: string;
  }): Promise<CreateIssueResult> {
    const { owner, repo, headers, title, body } = opts;

    const issueRes = await fetch(`${this.apiBase}/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, body }),
    });

    if (!issueRes.ok) {
      const text = await issueRes.text();
      throw new Error(`Failed to create issue: ${issueRes.status} ${text}`);
    }

    const data = (await issueRes.json()) as { html_url: string; number: number };
    return { url: data.html_url, number: data.number };
  }
}
