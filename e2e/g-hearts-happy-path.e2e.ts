/**
 * Hearts happy path e2e test (numeric_rounds, low-wins).
 *
 * Covers:
 *  1. Login as super admin
 *  2. Create 3 guest players
 *  3. Start a Hearts game (selects the Hearts module)
 *  4. Enter round scores (penalty points)
 *  5. Finish the game
 *  6. Results page: lowest total = rank 1 winner (low-wins)
 *  7. History page: completed Hearts game appears
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs, startGameViaUi } from './helpers';

test.describe('Hearts happy path (numeric_rounds, low-wins)', () => {
  test('full game flow: enter penalty points → lowest total wins', async ({ page }) => {
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

    const suffix = Date.now().toString().slice(-5);
    const hA = `HrtA${suffix}`;
    const hB = `HrtB${suffix}`;
    const hC = `HrtC${suffix}`;

    for (const name of [hA, hB, hC]) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    // ── 3. Start a Hearts game ────────────────────────────────────────────────
    await startGameViaUi(page, 'hearts', [hA, hB, hC]);

    // Score form visible (numeric entry, no finish-order UI)
    await expect(page.locator('.score-sheet')).toBeVisible();
    await expect(page.locator('input[type=number]').first()).toBeVisible();

    // ── 4. Enter Round 1 scores ───────────────────────────────────────────────
    // hA=5, hB=15, hC=10 penalty points
    await page.locator(`input[aria-label="Round score for ${hA}"]`).fill('5');
    await page.locator(`input[aria-label="Round score for ${hB}"]`).fill('15');
    await page.locator(`input[aria-label="Round score for ${hC}"]`).fill('10');

    await page.getByRole('button', { name: 'Save Round' }).click();

    // Round 2 form — confirms round 1 saved
    await expect(page.locator('.score-sheet__header')).toContainText('Round 2');

    // hA (5) leads (low-wins = fewest penalty points)
    await expect(page.locator('.totals-table__row--leader')).toContainText(hA);

    // ── 5. Enter Round 2 scores ───────────────────────────────────────────────
    // hA=20, hB=3, hC=8 — running totals: hA=25, hB=18, hC=18
    await page.locator(`input[aria-label="Round score for ${hA}"]`).fill('20');
    await page.locator(`input[aria-label="Round score for ${hB}"]`).fill('3');
    await page.locator(`input[aria-label="Round score for ${hC}"]`).fill('8');

    await page.getByRole('button', { name: 'Save Round' }).click();

    // Round 3 form — confirms round 2 saved
    await expect(page.locator('.score-sheet__header')).toContainText('Round 3');

    // ── 6. Finish the game ────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Finish Game' }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Finish Game' }).click();

    await expect(page).toHaveURL(/\/play\/[^/]+\/results$/);

    // ── 7. Results: low-wins — hB or hC (both 18) should be rank 1 ──────────
    // (both tied at 18 penalty points, lower than hA's 25)
    // There may be 2 winner rows when both players tie at rank 1 — use first()
    const winnerRows = page.locator('.results-table__row--winner');
    await expect(winnerRows.first()).toBeVisible();
    // Neither winner row should be hA (25 pts, rank 3)
    await expect(winnerRows.first()).not.toContainText(hA);

    // At least rank 1 and rank 3 should be visible (rank 1 may appear twice for the tie)
    await expect(page.getByText('#1').first()).toBeVisible();
    await expect(page.getByText('#3').first()).toBeVisible();

    // ── 8. History: completed game appears ────────────────────────────────────
    await page.goto('/history');
    await page.locator('button.filter-tabs__tab', { hasText: 'Completed' }).click();
    await expect(page.locator('.status-badge--complete').first()).toBeVisible();
  });
});
