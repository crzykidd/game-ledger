/**
 * Five Crowns happy path e2e test.
 *
 * Covers:
 *  1. Login as super admin
 *  2. Create 2 guest players
 *  3. Start a Five Crowns game (low-wins, 11 fixed rounds)
 *  4. Enter scores for round 1 → Save Round; verify round 2 inputs reset to empty
 *  5. Enter scores for round 2 → Save Round; verify round 3 inputs reset to empty
 *  6. Finish the game (early finish)
 *  7. Results page: low-score player is rank 1 (low wins)
 *
 * Score plan: CrowA=30+5=35, CrowB=10+5=15 → CrowB wins (lower total).
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs, startGameViaUi } from './helpers';

test.describe('Five Crowns happy path', () => {
  test('full game flow: low-wins, round forms reset between rounds', async ({ page }) => {
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

    const players = ['CrowA', 'CrowB'];
    for (const name of players) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    // ── 3. Start a Five Crowns game ───────────────────────────────────────────
    await startGameViaUi(page, 'five-crowns', players);
    await expect(page.locator('.score-sheet')).toBeVisible();

    // Should show fixed-round info: "Round 1 of 11"
    await expect(page.locator('.game-header__title')).toContainText('Round 1');
    await expect(page.locator('.game-header__title')).toContainText('of 11');

    // Round 1 wild rank hint: "3s"
    await expect(page.locator('.wild-rank-hint')).toContainText('3s');

    // ── 4. Round 1 ───────────────────────────────────────────────────────────
    await page.locator('input[aria-label="Round score for CrowA"]').fill('30');
    await page.locator('input[aria-label="Round score for CrowB"]').fill('10');
    await page.getByRole('button', { name: 'Save Round' }).click();

    // Round 2 form: inputs must be empty (regression: ScoreForm resets between rounds)
    await expect(page.locator('.score-sheet__header')).toContainText('Round 2');
    await expect(page.locator('input[aria-label="Round score for CrowA"]')).toHaveValue('');
    await expect(page.locator('input[aria-label="Round score for CrowB"]')).toHaveValue('');

    // After round 1: CrowB=10 leads (low wins)
    await expect(page.locator('.totals-table__row--leader')).toContainText('CrowB');

    // Round 2 wild rank: "4s"
    await expect(page.locator('.wild-rank-hint')).toContainText('4s');

    // ── 5. Round 2 ───────────────────────────────────────────────────────────
    await page.locator('input[aria-label="Round score for CrowA"]').fill('5');
    await page.locator('input[aria-label="Round score for CrowB"]').fill('5');
    await page.getByRole('button', { name: 'Save Round' }).click();

    // Round 3 form: inputs reset
    await expect(page.locator('.score-sheet__header')).toContainText('Round 3');
    await expect(page.locator('input[aria-label="Round score for CrowA"]')).toHaveValue('');
    await expect(page.locator('input[aria-label="Round score for CrowB"]')).toHaveValue('');

    // After round 2: CrowA=35, CrowB=15 — CrowB still leads (lower)
    await expect(page.locator('.totals-table__row--leader')).toContainText('CrowB');

    // ── 6. Finish the game (early finish) ─────────────────────────────────────
    await page.getByRole('button', { name: 'Finish Game' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Finish Game' }).click();

    await expect(page).toHaveURL(/\/play\/[^/]+\/results$/);

    // ── 7. Results: low-wins, CrowB is rank 1 ────────────────────────────────
    await expect(page.getByText(/Low score wins/i)).toBeVisible();

    const winnerRow = page.locator('.results-table__row--winner');
    await expect(winnerRow).toBeVisible();
    await expect(winnerRow).toContainText('CrowB');
    await expect(winnerRow).toContainText('#1');
    await expect(winnerRow.locator('.results-table__win-badge')).toBeVisible();

    await page.screenshot({ path: 'e2e/report/five-crowns-results.png' });
  });
});
