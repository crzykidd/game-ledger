/**
 * Skyjo happy path e2e test.
 *
 * Covers:
 *  1. Login as super admin
 *  2. Create 2 guest players
 *  3. Start a Skyjo game with those 2 players
 *  4. Enter scores across 2 rounds (ensuring the ender rule works)
 *  5. Finish the game
 *  6. Results page: low-score player is rank 1 with win badge
 *  7. History page: completed game appears with status-badge--complete
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs, startGameViaUi } from './helpers';

test.describe('Skyjo happy path', () => {
  test('full game flow from login to results and history', async ({ page }) => {
    const creds = getTestCreds();

    // ── 1. Login ─────────────────────────────────────────────────────────────
    await runSetupIfNeeded(page, creds);
    const meRes = await page.request.get('/api/auth/me');
    if (meRes.status() !== 200) {
      await loginAs(page, creds.adminEmail, creds.adminPassword);
    }

    // Confirm we're on the dashboard
    await expect(page).toHaveURL('/');

    // ── 2. Create 2 guest players ─────────────────────────────────────────────
    await page.goto('/players');

    // Create player "Alice"
    await page.getByRole('button', { name: 'Add guest player' }).click();
    await page.getByLabel('Nickname').fill('Alice');
    await page.getByRole('button', { name: 'Add player' }).click();
    await expect(page.getByText('Alice')).toBeVisible();

    // Create player "Bob"
    await page.getByRole('button', { name: 'Add guest player' }).click();
    await page.getByLabel('Nickname').fill('Bob');
    await page.getByRole('button', { name: 'Add player' }).click();
    await expect(page.getByText('Bob')).toBeVisible();

    // ── 3. Start a Skyjo game ─────────────────────────────────────────────────
    await startGameViaUi(page, 'skyjo', ['Alice', 'Bob']);

    // Wait for the score form to be visible
    await expect(page.locator('.score-sheet')).toBeVisible();

    // ── 4. Enter Round 1 scores ───────────────────────────────────────────────
    // Alice scores 15 (low = leader), Bob scores 25 — Alice is ender.
    await page.locator('input[aria-label="Round score for Alice"]').fill('15');
    await page.locator('input[aria-label="Round score for Bob"]').fill('25');

    // Mark Alice as ender (first player in seat order)
    await page.locator('button.ended-round-toggle').first().click();
    await expect(page.locator('button.ended-round-toggle').first()).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Save Round' }).click();

    // Wait for round 2 form to appear (score inputs cleared) — indicates round 1 saved
    await expect(page.locator('.score-sheet__header')).toContainText('Round 2');

    // After round 1: Alice=15, Bob=25. Alice leads.
    await expect(page.locator('.totals-table__row--leader')).toHaveCount(1);
    await expect(page.locator('.totals-table__row--leader')).toContainText('Alice');

    // ── 5. Enter Round 2 scores ───────────────────────────────────────────────
    // Alice=10, Bob=5 — Bob ender.
    // Final totals: Alice=25, Bob=30.
    await page.locator('input[aria-label="Round score for Alice"]').fill('10');
    await page.locator('input[aria-label="Round score for Bob"]').fill('5');

    // Bob ends round 2 (second player in seat order)
    await page.locator('button.ended-round-toggle').nth(1).click();
    await expect(page.locator('button.ended-round-toggle').nth(1)).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Save Round' }).click();

    // Wait for round 3 form — confirms round 2 saved
    await expect(page.locator('.score-sheet__header')).toContainText('Round 3');

    // Alice (25) still leads over Bob (30)
    await expect(page.locator('.totals-table__row--leader')).toHaveCount(1);
    await expect(page.locator('.totals-table__row--leader')).toContainText('Alice');

    // ── 6. Finish the game ────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Finish Game' }).click();

    // Confirmation modal
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Finish Game' }).click();

    // Should navigate to results page
    await expect(page).toHaveURL(/\/play\/[^/]+\/results$/);

    // ── 7. Results: Alice is rank 1 with win badge ────────────────────────────
    const winnerRow = page.locator('.results-table__row--winner');
    await expect(winnerRow).toBeVisible();
    await expect(winnerRow).toContainText('Alice');
    await expect(winnerRow).toContainText('#1');
    await expect(winnerRow.locator('.results-table__win-badge')).toBeVisible();

    // Bob should be rank 2 without win badge
    const bobRow = page.locator('.results-table__row').filter({ hasText: 'Bob' });
    await expect(bobRow).toContainText('#2');
    await expect(bobRow.locator('.results-table__win-badge')).toHaveCount(0);

    // ── 8. History: completed game appears ────────────────────────────────────
    await page.goto('/history');

    // Filter to completed
    await page.locator('button.filter-tabs__tab', { hasText: 'Completed' }).click();

    // Expect at least one completed history card
    const completedCards = page.locator('.history-card');
    await expect(completedCards.first()).toBeVisible();
    await expect(page.locator('.status-badge--complete').first()).toBeVisible();
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
