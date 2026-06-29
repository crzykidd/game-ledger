/**
 * Gin Rummy happy path e2e test (numeric_rounds, high-wins, 2-player).
 *
 * Covers:
 *  1. Login as super admin
 *  2. Create 2 guest players
 *  3. Start a Gin Rummy game
 *  4. Enter hand scores (high total wins)
 *  5. Finish the game
 *  6. Results page: highest total = rank 1 winner (high-wins)
 *  7. History page: completed game appears
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs, startGameViaUi } from './helpers';

test.describe('Gin Rummy happy path (numeric_rounds, high-wins)', () => {
  test('full game flow: enter hand points → highest total wins', async ({ page }) => {
    const creds = getTestCreds();

    // ── 1. Login ─────────────────────────────────────────────────────────────
    await runSetupIfNeeded(page, creds);
    const meRes = await page.request.get('/api/auth/me');
    if (meRes.status() !== 200) {
      await loginAs(page, creds.adminEmail, creds.adminPassword);
    }
    await expect(page).toHaveURL('/');

    // ── 2. Create 2 guest players ─────────────────────────────────────────────
    await page.goto('/players');

    const suffix = Date.now().toString().slice(-5);
    const ginA = `GinA${suffix}`;
    const ginB = `GinB${suffix}`;

    for (const name of [ginA, ginB]) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    // ── 3. Start a Gin Rummy game ─────────────────────────────────────────────
    // Gin Rummy is 2-player only (min=max=2); the count button '2' is the only option.
    await startGameViaUi(page, 'gin-rummy', [ginA, ginB]);

    // Score form visible — numeric entry (not finish-order UI)
    await expect(page.locator('.score-sheet')).toBeVisible();
    await expect(page.locator('input[type=number]').first()).toBeVisible();

    // ── 4. Enter Round 1 scores ───────────────────────────────────────────────
    // ginA wins this hand by knocking: +35 for ginA, 0 for ginB
    await page.locator(`input[aria-label="Round score for ${ginA}"]`).fill('35');
    await page.locator(`input[aria-label="Round score for ${ginB}"]`).fill('0');

    await page.getByRole('button', { name: 'Save Round' }).click();
    await expect(page.locator('.score-sheet__header')).toContainText('Round 2');

    // ginA (35) leads (high-wins)
    await expect(page.locator('.totals-table__row--leader')).toContainText(ginA);

    // ── 5. Enter Round 2 scores ───────────────────────────────────────────────
    // ginB wins hand 2: +50 for ginB, 0 for ginA — totals: ginA=35, ginB=50
    await page.locator(`input[aria-label="Round score for ${ginA}"]`).fill('0');
    await page.locator(`input[aria-label="Round score for ${ginB}"]`).fill('50');

    await page.getByRole('button', { name: 'Save Round' }).click();
    await expect(page.locator('.score-sheet__header')).toContainText('Round 3');

    // ginB (50) now leads
    await expect(page.locator('.totals-table__row--leader')).toContainText(ginB);

    // ── 6. Finish the game ────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Finish Game' }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Finish Game' }).click();

    await expect(page).toHaveURL(/\/play\/[^/]+\/results$/);

    // ── 7. Results: high-wins — ginB (50) is rank 1 ──────────────────────────
    const winnerRow = page.locator('.results-table__row--winner');
    await expect(winnerRow).toBeVisible();
    await expect(winnerRow).toContainText(ginB);
    await expect(winnerRow).toContainText('#1');
    await expect(winnerRow.locator('.results-table__win-badge')).toBeVisible();

    // ginA should be rank 2
    const ginARow = page.locator('.results-table__row').filter({ hasText: ginA });
    await expect(ginARow).toContainText('#2');

    // ── 8. History: completed game appears ────────────────────────────────────
    await page.goto('/history');
    await page.locator('button.filter-tabs__tab', { hasText: 'Completed' }).click();
    await expect(page.locator('.status-badge--complete').first()).toBeVisible();
  });
});
