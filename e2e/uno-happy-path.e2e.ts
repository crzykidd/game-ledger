/**
 * Uno happy path e2e test.
 *
 * Covers:
 *  1. Login as super admin
 *  2. Create 2 guest players
 *  3. Start an Uno game with those 2 players
 *  4. Enter scores for round 1 → Save Round
 *  5. Verify round 2 form inputs are EMPTY (regression: ScoreForm must reset between rounds)
 *  6. Enter scores for round 2 → Save Round
 *  7. Finish the game
 *  8. Results page: high-score player is rank 1 (high wins)
 *  9. Dashboard: active game shows "Uno" not "Skyjo"
 * 10. History: completed Uno game shows "Uno" not "Skyjo", no Skyjo reference shown
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs, startGameViaUi } from './helpers';

test.describe('Uno happy path', () => {
  test('full game flow: save 2 rounds → finish → high-wins results', async ({ page }) => {
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

    const players = ['UnoA', 'UnoB'];
    for (const name of players) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    // ── 3. Start an Uno game ──────────────────────────────────────────────────
    await startGameViaUi(page, 'uno', players);
    await expect(page.locator('.score-sheet')).toBeVisible();

    // ── 4. Round 1 ───────────────────────────────────────────────────────────
    // Uno has no endedRound toggle
    await expect(page.locator('button.ended-round-toggle')).toHaveCount(0);
    await expect(page.locator('.score-sheet__header')).toContainText('Round 1');

    await page.locator('input[aria-label="Round score for UnoA"]').fill('50');
    await page.locator('input[aria-label="Round score for UnoB"]').fill('30');

    await page.getByRole('button', { name: 'Save Round' }).click();

    // ── 5. Round 2 form must have EMPTY inputs (regression: ScoreForm state reset) ──
    await expect(page.locator('.score-sheet__header')).toContainText('Round 2');
    await expect(page.locator('input[aria-label="Round score for UnoA"]')).toHaveValue('');
    await expect(page.locator('input[aria-label="Round score for UnoB"]')).toHaveValue('');

    // After round 1: UnoA=50 leads (high wins)
    await expect(page.locator('.totals-table__row--leader')).toContainText('UnoA');

    // ── 6. Round 2 ───────────────────────────────────────────────────────────
    await page.locator('input[aria-label="Round score for UnoA"]').fill('40');
    await page.locator('input[aria-label="Round score for UnoB"]').fill('20');

    await page.getByRole('button', { name: 'Save Round' }).click();

    // Round 3 form appears with EMPTY inputs
    await expect(page.locator('.score-sheet__header')).toContainText('Round 3');
    await expect(page.locator('input[aria-label="Round score for UnoA"]')).toHaveValue('');

    // After round 2: UnoA=90, UnoB=50 — UnoA still leads
    await expect(page.locator('.totals-table__row--leader')).toContainText('UnoA');

    // ── 7. Finish the game ────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Finish Game' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Finish Game' }).click();

    await expect(page).toHaveURL(/\/play\/[^/]+\/results$/);

    // ── 8. Results: high-wins, UnoA rank 1 ───────────────────────────────────
    await expect(page.getByText(/High score wins/i)).toBeVisible();

    const winnerRow = page.locator('.results-table__row--winner');
    await expect(winnerRow).toBeVisible();
    await expect(winnerRow).toContainText('UnoA');
    await expect(winnerRow).toContainText('#1');
    await expect(winnerRow.locator('.results-table__win-badge')).toBeVisible();

    await page.screenshot({ path: 'e2e/report/uno-results.png' });

    // ── 9. Dashboard: active game module name NOT "Skyjo" ─────────────────────
    // Start a second Uno game to verify dashboard shows "Uno"
    await startGameViaUi(page, 'uno', players);

    // Go to dashboard and verify active game shows "Uno" not "Skyjo"
    await page.goto('/');
    const activeGameModule = page.locator('[data-testid="active-game-row__module"]').first();
    await expect(activeGameModule).toBeVisible();
    await expect(activeGameModule).not.toHaveText('Skyjo');
    await expect(activeGameModule).toHaveText('Uno');

    await page.screenshot({ path: 'e2e/report/uno-dashboard-name.png' });

    // ── 10. History: Uno shows "Uno" and no Skyjo reference ───────────────────
    await page.goto('/history');

    // The history page should NOT show the SkyjoReference widget
    await expect(page.locator('.skyjo-reference')).toHaveCount(0);

    // The completed Uno game should show "Uno" not "Skyjo"
    const unoCard = page.locator('.history-card__module', { hasText: 'Uno' }).first();
    await expect(unoCard).toBeVisible();

    await page.screenshot({ path: 'e2e/report/uno-history-name.png' });
  });
});
