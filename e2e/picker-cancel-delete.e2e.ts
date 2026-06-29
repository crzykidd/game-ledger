/**
 * E2E tests for:
 *  1. Module picker — no default selection, specific (non-default) module choice via dropdown.
 *  2. Cancel an active game → shows Abandoned in History.
 *  3. Delete a game from History → gone from the list.
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs, startGameViaUi } from './helpers';

test.describe('Picker, cancel, and delete', () => {
  test('picks a non-default module (Skyjo) and starts a game', async ({ page }) => {
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
    const p1 = `PkrA${suffix}`;
    const p2 = `PkrB${suffix}`;
    for (const name of [p1, p2]) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    // ── 3. Start page: no default selection ─────────────────────────────────────
    await page.goto('/play/new');

    // Start game should be disabled before picking a module
    const startBtn = page.getByRole('button', { name: 'Start game' });
    await expect(startBtn).toBeDisabled();

    // Game select defaults to the empty placeholder (no game pre-selected)
    await expect(page.locator('#game-select')).toHaveValue('');

    // All games are pre-release; enable the toggle so they appear in the picker.
    const toggle = page.locator('#show-pre-release');
    if (!(await toggle.isChecked())) {
      await toggle.click();
    }

    // Pick Skyjo from the dropdown (not the first module alphabetically)
    await page.locator('#game-select').selectOption('skyjo');

    // After selecting Skyjo, player-count buttons appear (2–8 for Skyjo)
    await expect(page.getByRole('button', { name: '2', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '8', exact: true })).toBeVisible();

    // Start still disabled until count and seats are filled
    await expect(startBtn).toBeDisabled();

    // Select 2 players
    await page.getByRole('button', { name: '2', exact: true }).click();
    await page.locator('#slot-0').selectOption({ label: p1 });
    await page.locator('#slot-1').selectOption({ label: p2 });

    // Start game
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    await expect(page).toHaveURL(/\/play\/[^/]+$/);
    await expect(page.locator('.score-sheet')).toBeVisible();

    await page.screenshot({ path: 'e2e/report/picker-skyjo-selected.png' });
  });

  test('cancel an active game — shows Abandoned in History', async ({ page }) => {
    const creds = getTestCreds();

    await runSetupIfNeeded(page, creds);
    const meRes = await page.request.get('/api/auth/me');
    if (meRes.status() !== 200) {
      await loginAs(page, creds.adminEmail, creds.adminPassword);
    }
    await expect(page).toHaveURL('/');

    // ── Create 2 guest players ────────────────────────────────────────────────
    await page.goto('/players');
    const suffix = Date.now().toString().slice(-5);
    const pa = `CancA${suffix}`;
    const pb = `CancB${suffix}`;
    for (const name of [pa, pb]) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    // ── Start a Skyjo game ────────────────────────────────────────────────────
    await startGameViaUi(page, 'skyjo', [pa, pb]);

    // ── Cancel the game ───────────────────────────────────────────────────────
    const cancelBtn = page.getByRole('button', { name: /Cancel game/i });
    await expect(cancelBtn).toBeVisible();
    await page.screenshot({ path: 'e2e/report/game-cancel-button.png' });
    await cancelBtn.click();

    // Confirmation modal
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(/Scores will be kept/i);

    await page.screenshot({ path: 'e2e/report/game-cancel-confirm.png' });

    // Confirm
    await modal.getByRole('button', { name: /Cancel game/i }).click();

    // Should navigate to dashboard
    await expect(page).toHaveURL('/');

    // ── History: game shows Abandoned status badge ────────────────────────────
    await page.goto('/history');
    await expect(page.locator('.status-badge--abandoned').first()).toBeVisible();
  });

  test('delete a game from History — gone from the list', async ({ page }) => {
    const creds = getTestCreds();

    await runSetupIfNeeded(page, creds);
    const meRes = await page.request.get('/api/auth/me');
    if (meRes.status() !== 200) {
      await loginAs(page, creds.adminEmail, creds.adminPassword);
    }
    await expect(page).toHaveURL('/');

    // ── Create 2 guest players ────────────────────────────────────────────────
    await page.goto('/players');
    const suffix = Date.now().toString().slice(-5);
    const da = `DelA${suffix}`;
    const db = `DelB${suffix}`;
    for (const name of [da, db]) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    // ── Start and immediately abandon a Skyjo game ────────────────────────────
    await startGameViaUi(page, 'skyjo', [da, db]);

    // Cancel the game to make it abandoned
    await page.getByRole('button', { name: /Cancel game/i }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Cancel game/i }).click();
    await expect(page).toHaveURL('/');

    // ── Go to History and verify abandoned game is listed ─────────────────────
    await page.goto('/history');
    await expect(page.locator('.status-badge--abandoned').first()).toBeVisible();

    // Find and click Delete
    const deleteBtn = page.getByRole('button', { name: /^Delete$/i }).first();
    await expect(deleteBtn).toBeVisible();
    await page.screenshot({ path: 'e2e/report/history-delete-button.png' });
    await deleteBtn.click();

    // Confirmation modal
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(/can't be undone/i);
    await page.screenshot({ path: 'e2e/report/history-delete-confirm.png' });

    // Confirm delete
    await modal.getByRole('button', { name: /Delete game/i }).click();

    // After deletion the player names should no longer appear in the game list
    // (the game with da/db was the last Abandoned entry we interacted with)
    await expect(page.locator('.history-card').filter({ hasText: da })).toHaveCount(0);
  });
});
