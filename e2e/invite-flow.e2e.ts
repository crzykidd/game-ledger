/**
 * Invite flow e2e test.
 *
 * Covers:
 *  1. Admin (SUPER_ADMIN) logs in
 *  2. Admin navigates to /admin/invites and creates an invite for a new email
 *  3. The invite link is shown in a modal — capture the token via network intercept
 *  4. Navigate to the invite accept URL
 *  5. Complete the signup form
 *  6. Get redirected to /login with a success message
 *  7. Log in as the new user → dashboard loads
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs } from './helpers';

test.describe('Invite flow', () => {
  test('admin creates invite, new user signs up and logs in', async ({ page }) => {
    const creds = getTestCreds();

    // ── 1. Run install wizard if this is the first test in the run ───────────
    await runSetupIfNeeded(page, creds);

    // ── 2. Log in as admin ────────────────────────────────────────────────────
    const meRes = await page.request.get('/api/auth/me');
    if (meRes.status() !== 200) {
      await loginAs(page, creds.adminEmail, creds.adminPassword);
    }

    // ── 3. Create invite — intercept the API response to capture the link ─────
    const inviteEmail = `e2e-invite-${Date.now()}@test.local`;
    let capturedLink = '';

    // Listen for the POST /api/invites response before navigating to the page.
    page.on('response', async (response) => {
      if (response.url().includes('/api/invites') && response.request().method() === 'POST') {
        try {
          const body = await response.json();
          if (body.link) capturedLink = body.link;
        } catch {
          // ignore parse errors
        }
      }
    });

    await page.goto('/admin/invites');
    await expect(page).toHaveURL('/admin/invites');

    await page.getByRole('button', { name: 'Create invite' }).click();

    const createModal = page.getByRole('dialog');
    await expect(createModal).toBeVisible();
    await createModal.getByLabel('Email address').fill(inviteEmail);
    await createModal.getByRole('button', { name: 'Create & get link' }).click();

    // Wait for the copy-link modal to open (indicates the POST succeeded).
    const linkModal = page.getByRole('dialog');
    await expect(linkModal.getByRole('heading', { name: 'Invite link' })).toBeVisible({ timeout: 10_000 });
    await linkModal.getByRole('button', { name: 'Done' }).click();

    // Ensure we captured the link.
    expect(capturedLink).toBeTruthy();

    // ── 4. Extract token and use a fresh browser context to accept invite ────────
    // The admin is still logged in. We use a fresh context so the new user can
    // accept the invite without the admin session interfering with the redirect.
    const token = capturedLink.split('/').pop()!;
    expect(token).toBeTruthy();

    const browser = page.context().browser()!;
    const newContext = await browser.newContext();
    const invitePage = await newContext.newPage();

    try {
      // The frontend route for accepting invites is /invite/:token
      await invitePage.goto(`http://localhost:5174/invite/${token}`);

      // ── 5. Complete signup form ─────────────────────────────────────────────
      await expect(invitePage.locator('h1', { hasText: 'Accept Invitation' })).toBeVisible();
      await expect(invitePage.getByText(inviteEmail)).toBeVisible();

      await invitePage.getByLabel('Full name').fill('New E2E Player');
      await invitePage.getByLabel('Nickname').fill('newe2eplayer');
      await invitePage.getByLabel('Password').fill('NewE2EPlayer1!');
      await invitePage.getByRole('button', { name: 'Create account' }).click();

      // ── 6. Redirected to /login with success message ────────────────────────
      // No existing session — Login component won't auto-redirect.
      await expect(invitePage).toHaveURL('http://localhost:5174/login');
      await expect(invitePage.getByLabel('Email')).toBeVisible({ timeout: 15_000 });
      await expect(invitePage.getByText(/account created/i)).toBeVisible();

      // ── 7. Log in as the new user → dashboard ────────────────────────────────
      await invitePage.getByLabel('Email').fill(inviteEmail);
      await invitePage.getByLabel('Password').fill('NewE2EPlayer1!');
      await invitePage.getByRole('button', { name: 'Sign in' }).click();

      await expect(invitePage).toHaveURL('http://localhost:5174/');
    } finally {
      await newContext.close();
    }
  });
});
