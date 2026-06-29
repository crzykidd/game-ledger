/**
 * Coup happy path e2e test (rank_order, elimination/finish-order).
 *
 * Covers:
 *  1. Login as super admin
 *  2. Create 3 guest players
 *  3. Start a Coup game (selects the Coup module)
 *  4. Set the finish order (drag/arrow buttons to rank players)
 *  5. Submit finish order → results page automatically
 *  6. Results page: ranking result (no Score column), winner = rank 1
 *  7. History page: completed Coup game appears
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs, startGameViaUi } from './helpers';

test.describe('Coup happy path (rank_order, elimination game)', () => {
  test('full game flow: finish-order entry → ranking results', async ({ page }) => {
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
    const cA = `CoupA${suffix}`;
    const cB = `CoupB${suffix}`;
    const cC = `CoupC${suffix}`;

    for (const name of [cA, cB, cC]) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    // ── 3. Start a Coup game ──────────────────────────────────────────────────
    await startGameViaUi(page, 'coup', [cA, cB, cC]);

    // ── 4. Finish-order entry ─────────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /Set Finish Order/i })).toBeVisible();
    await expect(page.getByText(/Drag to set finish order/i)).toBeVisible();

    // Should NOT show numeric score inputs
    await expect(page.locator('input[type=number]')).toHaveCount(0);

    // Players should all be listed
    await expect(page.getByText(cA)).toBeVisible();
    await expect(page.getByText(cB)).toBeVisible();
    await expect(page.getByText(cC)).toBeVisible();

    // Move cC to position 1 (winner — last survivor)
    const moveUpButtons = page.locator(`button[aria-label^="Move ${cC} up"]`);
    await moveUpButtons.click();
    await moveUpButtons.click();

    // ── 5. Submit finish order ────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Submit Finish Order' }).click();

    // Auto-navigates to results (rank_order = no separate finish button)
    await expect(page).toHaveURL(/\/play\/[^/]+\/results$/);

    // ── 6. Results page: ranking result, no Score column ─────────────────────
    await expect(page.getByRole('heading', { name: /Game Over/i })).toBeVisible();
    await expect(page.getByText(/Ranked by finish order/i)).toBeVisible();

    // cC is rank 1 (last survivor = winner in elimination games)
    await expect(page.getByText(new RegExp(`${cC} wins!`, 'i'))).toBeVisible();

    // Ranking rows visible
    await expect(page.getByText('#1')).toBeVisible();
    await expect(page.getByText('#2')).toBeVisible();
    await expect(page.getByText('#3')).toBeVisible();

    // No "Score" column (rank-only result)
    await expect(page.getByText(/^Score$/)).toHaveCount(0);

    // Winner row highlighted
    const winnerRow = page.locator('.results-table__row--winner');
    await expect(winnerRow).toBeVisible();
    await expect(winnerRow).toContainText(cC);

    // ── 7. History: completed game appears ────────────────────────────────────
    await page.goto('/history');
    await expect(page.getByText(/Coup/i).first()).toBeVisible();
    await expect(page.getByText('Complete').first()).toBeVisible();
  });
});
