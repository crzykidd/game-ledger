/**
 * Fresh-DB setup gate e2e test.
 *
 * This test suite intentionally runs with the DB in a clean (un-set-up) state,
 * which global-setup.ts guarantees by truncating all tables but NOT calling the
 * install wizard API. It must run before the other suites so that it seeds the
 * admin account they rely on.
 *
 * (Playwright runs test files in alphabetical order with workers:1; this file
 * sorts before invite-flow and skyjo-happy-path, so ordering is guaranteed.)
 *
 * Covers:
 *  1. Loading / on a fresh DB → shows the install wizard, NOT the login page.
 *  2. Completing the wizard creates the super admin and redirects to /.
 *  3. After setup, a normal login works.
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, loginAs } from './helpers';

test.describe('Fresh-DB setup gate', () => {
  test('/ shows the install wizard (not login) on a fresh DB', async ({ page }) => {
    const creds = getTestCreds();

    // Navigate to the root — should redirect to /setup, not /login.
    await page.goto('/');

    // Verify we landed on /setup (the install wizard), not /login.
    await expect(page).toHaveURL('/setup', { timeout: 15_000 });

    // The install wizard should be visible.
    await expect(page.getByText(/create your administrator account/i)).toBeVisible({
      timeout: 10_000,
    });

    // The login form must NOT be present.
    await expect(page.getByRole('link', { name: /sign in/i })).not.toBeVisible();
  });

  test('wizard creates the super admin and lands on the dashboard', async ({ page }) => {
    const creds = getTestCreds();

    // Check setup status — if already done from a previous test run, skip.
    const statusRes = await page.request.get('/api/setup/status');
    const { setupComplete } = await statusRes.json();
    if (setupComplete) {
      // Already seeded — just verify login works and bail out.
      await loginAs(page, creds.adminEmail, creds.adminPassword);
      await expect(page).toHaveURL('/');
      return;
    }

    // Go to the wizard.
    await page.goto('/setup');
    await expect(page.getByText(/create your administrator account/i)).toBeVisible();

    // Fill in the form.
    await page.getByLabel('Full name').fill(creds.adminFullName);
    await page.getByLabel('Nickname').fill(creds.adminNickname);
    await page.getByLabel('Email').fill(creds.adminEmail);
    await page.getByLabel('Password').fill(creds.adminPassword);
    await page.getByRole('button', { name: 'Create account' }).click();

    // After setup the wizard auto-logs-in and navigates to /.
    await expect(page).toHaveURL('/', { timeout: 15_000 });

    // Should be on the dashboard (not the wizard or login).
    await expect(page.getByText(/create your administrator account/i)).not.toBeVisible();
  });

  test('normal login works after setup is complete', async ({ page }) => {
    const creds = getTestCreds();

    // Log out first (in case we are still logged in from the wizard).
    await page.goto('/');
    // Attempt logout via API to clear session.
    await page.request.post('/api/auth/logout').catch(() => {/* ignore */});

    // Navigate to / — should now show login (setup is done, no session).
    await loginAs(page, creds.adminEmail, creds.adminPassword);
    await expect(page).toHaveURL('/');
  });
});
