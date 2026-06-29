/**
 * President (rank_order) happy path e2e test.
 *
 * Covers:
 *  1. Login as super admin
 *  2. Create 3 guest players
 *  3. Start a President game with those 3 players
 *  4. Drag-to-reorder finish order (arrow buttons) → Submit
 *  5. Results page: ranking result (no Score column), winner = rank 1, winner highlighted
 *  6. History page: completed President game appears
 *
 * Also confirms: Skyjo game page is unaffected (score inputs still present).
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs, startGameViaUi } from './helpers';

test.describe('President (rank_order) happy path', () => {
  test('full game flow: finish-order entry → ranking results, no score column', async ({
    page,
  }) => {
    const creds = getTestCreds();

    // ── 1. Login ─────────────────────────────────────────────────────────────
    await runSetupIfNeeded(page, creds);
    const meRes = await page.request.get('/api/auth/me');
    if (meRes.status() !== 200) {
      await loginAs(page, creds.adminEmail, creds.adminPassword);
    }
    await expect(page).toHaveURL('/');

    // ── 2. Create 3 guest players ─────────────────────────────────────────────
    await page.goto('/players');

    const players = ['PresA', 'PresB', 'PresC'];
    for (const name of players) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    // ── 3. Start a President game ─────────────────────────────────────────────
    await startGameViaUi(page, 'president', players);

    // ── 4. Finish-order entry ────────────────────────────────────────────────
    // Game page should show FinishOrderForm (not numeric inputs)
    await expect(page.getByRole('heading', { name: /Set Finish Order/i })).toBeVisible();
    await expect(page.getByText(/Drag to set finish order/i)).toBeVisible();

    // Should NOT show numeric score inputs
    await expect(page.locator('input[type=number]')).toHaveCount(0);

    // The seat list should show PresA, PresB, PresC in some initial order
    await expect(page.getByText('PresA')).toBeVisible();
    await expect(page.getByText('PresB')).toBeVisible();
    await expect(page.getByText('PresC')).toBeVisible();

    // Use arrow buttons to reorder: move PresC to position 1
    // The list starts: PresA(1), PresB(2), PresC(3)
    // Move PresC up twice to make it 1st
    const moveUpButtons = page.locator('button[aria-label^="Move PresC up"]');
    await moveUpButtons.click();
    await moveUpButtons.click();

    // Submit the finish order
    await page.getByRole('button', { name: 'Submit Finish Order' }).click();

    // Should navigate to results page automatically
    await expect(page).toHaveURL(/\/play\/[^/]+\/results$/);

    // ── 5. Results page: ranking result (no Score column) ────────────────────
    // "Game Over" heading
    await expect(page.getByRole('heading', { name: /Game Over/i })).toBeVisible();

    // Winner announcement: PresC wins (rank 1)
    await expect(page.getByText(/PresC wins!/i)).toBeVisible();

    // Subtitle: "Ranked by finish order"
    await expect(page.getByText(/Ranked by finish order/i)).toBeVisible();

    // Rankings table: #1, #2, #3 visible
    await expect(page.getByText('#1')).toBeVisible();
    await expect(page.getByText('#2')).toBeVisible();
    await expect(page.getByText('#3')).toBeVisible();

    // No "Score" column header (rank-only result)
    await expect(page.getByText(/^Score$/)).toHaveCount(0);

    // Winner row should have the winner badge / highlighted class
    const presRow = page.locator('.results-table__row--winner');
    await expect(presRow).toBeVisible();
    await expect(presRow).toContainText('PresC');

    // Take a screenshot of the results
    await page.screenshot({ path: 'e2e/report/president-ranking-results.png' });

    // ── 6. History page: completed game appears ───────────────────────────────
    await page.goto('/history');
    await expect(page.getByText(/President/i).first()).toBeVisible();
    await expect(page.getByText('Complete').first()).toBeVisible();
  });

  test('Skyjo game still shows numeric score inputs (regression check)', async ({ page }) => {
    const creds = getTestCreds();

    await runSetupIfNeeded(page, creds);
    const meRes = await page.request.get('/api/auth/me');
    if (meRes.status() !== 200) {
      await loginAs(page, creds.adminEmail, creds.adminPassword);
    }

    // Ensure we have players. Use unique nicknames per run so the seat selects on
    // /play/new resolve unambiguously regardless of prior test data.
    await page.goto('/players');
    const suffix = Date.now().toString().slice(-5);
    const skyA = `SkyA${suffix}`;
    const skyB = `SkyB${suffix}`;
    for (const name of [skyA, skyB]) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    await startGameViaUi(page, 'skyjo', [skyA, skyB]);

    // Should show numeric score inputs (not finish-order UI)
    await expect(page.locator('input[type=number]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Save Round/i })).toBeVisible();

    // Should NOT show finish-order UI
    await expect(
      page.getByRole('heading', { name: /Set Finish Order/i }),
    ).not.toBeVisible();

    // Take screenshot of numeric entry for reference
    await page.screenshot({ path: 'e2e/report/skyjo-numeric-entry-regression.png' });
  });
});
