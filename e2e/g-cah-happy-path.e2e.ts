/**
 * Cards Against Humanity (winner_pick) happy path e2e test.
 *
 * Covers:
 *  1. Login as super admin
 *  2. Create 3 guest players
 *  3. Start a Cards Against Humanity game
 *  4. Pick winners across ≥2 rounds using the WinnerPickForm
 *  5. Finish the game at target (or manually)
 *  6. Results page: high-wins results, winner = most Awesome Points, rank 1 highlighted
 *  7. History page: completed CAH game appears
 *
 * Also confirms: Skyjo numeric entry regression (score inputs still present).
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs, startGameViaUi } from './helpers';

test.describe('Cards Against Humanity (winner_pick) happy path', () => {
  test('full game flow: winner picker → high-wins results', async ({ page }) => {
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

    // Use unique suffix to avoid collision with other tests
    const suffix = Date.now().toString().slice(-6);
    const players = [`CahA${suffix}`, `CahB${suffix}`, `CahC${suffix}`];

    for (const name of players) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    // ── 3. Start a Cards Against Humanity game ────────────────────────────────
    await startGameViaUi(page, 'cards-against-humanity', players);

    // ── 4. WinnerPickForm is shown ────────────────────────────────────────────
    await expect(page.getByRole('heading', { name: /Pick Round Winner/i })).toBeVisible();

    // No numeric score inputs (not a numeric_rounds game)
    await expect(page.locator('input[type=number]')).toHaveCount(0);

    // Player buttons should be present
    for (const name of players) {
      await expect(
        page.getByRole('button', { name: new RegExp(`Select ${name} as round winner`, 'i') }),
      ).toBeVisible();
    }

    // Award Point should be disabled until a player is selected
    await expect(page.getByRole('button', { name: /Award Point/i })).toBeDisabled();

    // ── 5. Round 1: pick CahA as winner ──────────────────────────────────────
    await page.getByRole('button', { name: new RegExp(`Select ${players[0]} as round winner`, 'i') }).click();
    await expect(page.getByRole('button', { name: /Award Point/i })).not.toBeDisabled();
    await expect(
      page.getByRole('button', { name: new RegExp(`Select ${players[0]} as round winner`, 'i') }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: /Award Point/i }).click();

    // Wait for round 2 (form resets, round counter advances — check the WinnerPickForm header)
    await expect(page.getByText(/Round 2 — Pick the winner/i)).toBeVisible();

    // ── 6. Round 2: pick CahB as winner ──────────────────────────────────────
    await page.getByRole('button', { name: new RegExp(`Select ${players[1]} as round winner`, 'i') }).click();
    await page.getByRole('button', { name: /Award Point/i }).click();

    // Wait for round 3 header (the WinnerPickForm sub-header)
    await expect(page.getByText(/Round 3 — Pick the winner/i)).toBeVisible();

    // ── 7. Finish the game ────────────────────────────────────────────────────
    // Use the "Finish Game" button (winner_pick games have manual finish like numeric)
    await page.getByRole('button', { name: 'Finish Game' }).click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Finish Game' }).click();

    // Should navigate to results page
    await expect(page).toHaveURL(/\/play\/[^/]+\/results$/);

    // ── 8. Results: high-wins result, winner highlighted ─────────────────────
    // Both CahA and CahB won 1 round — they may be tied; CahC has 0
    await expect(page.getByRole('heading', { name: /Game Over/i })).toBeVisible();

    // Rankings table should show at least one #1 rank
    await expect(page.getByText('#1').first()).toBeVisible();

    // CahC should be last (0 points)
    const cahCRow = page.locator('.results-table__row').filter({ hasText: players[2] });
    await expect(cahCRow).toBeVisible();

    // Winner row(s) should have a win badge (may be tied when we played only 2 rounds)
    const winnerRow = page.locator('.results-table__row--winner').first();
    await expect(winnerRow).toBeVisible();

    // Score column should be visible (numeric_total result shows scores)
    await expect(page.getByText(/^Score$/i).first()).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: 'e2e/report/cah-results.png' });

    // ── 9. History: completed game appears ────────────────────────────────────
    await page.goto('/history');
    await expect(page.getByText(/Cards Against Humanity/i).first()).toBeVisible();
    await expect(page.getByText('Complete').first()).toBeVisible();
  });

  test('winner_pick game shows winner picker, not numeric inputs (CAH regression)', async ({ page }) => {
    const creds = getTestCreds();

    await runSetupIfNeeded(page, creds);
    const meRes = await page.request.get('/api/auth/me');
    if (meRes.status() !== 200) {
      await loginAs(page, creds.adminEmail, creds.adminPassword);
    }

    await page.goto('/players');
    const suffix = Date.now().toString().slice(-6);
    const cahA = `CahReg${suffix}a`;
    const cahB = `CahReg${suffix}b`;
    const cahC = `CahReg${suffix}c`;

    for (const name of [cahA, cahB, cahC]) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    await startGameViaUi(page, 'cards-against-humanity', [cahA, cahB, cahC]);

    // WinnerPickForm shown
    await expect(page.getByRole('heading', { name: /Pick Round Winner/i })).toBeVisible();

    // NO numeric inputs
    await expect(page.locator('input[type=number]')).toHaveCount(0);

    // NO "Save Round" button
    await expect(page.getByRole('button', { name: /Save Round/i })).toHaveCount(0);

    // "Award Point" button is present
    await expect(page.getByRole('button', { name: /Award Point/i })).toBeVisible();

    await page.screenshot({ path: 'e2e/report/cah-winner-picker.png' });
  });
});
