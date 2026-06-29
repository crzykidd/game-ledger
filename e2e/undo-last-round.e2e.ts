/**
 * Undo last round e2e test.
 *
 * Covers:
 *  1. Login as super admin
 *  2. Create 2 guest players
 *  3. Start a Skyjo game
 *  4. Save round 1 scores
 *  5. Save round 2 scores
 *  6. Undo last round — totals revert to round 1 state
 *  7. Continue: save a new round 2 (different scores)
 *  8. Finish the game — results are based on rounds 1 + new round 2
 */
import { test, expect } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs, startGameViaUi } from './helpers';

test.describe('Undo last round', () => {
  test('save 2 rounds, undo last, totals revert, continue and finish', async ({ page }) => {
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

    await page.getByRole('button', { name: 'Add guest player' }).click();
    await page.getByLabel('Nickname').fill('UndoAlice');
    await page.getByRole('button', { name: 'Add player' }).click();
    await expect(page.getByText('UndoAlice')).toBeVisible();

    await page.getByRole('button', { name: 'Add guest player' }).click();
    await page.getByLabel('Nickname').fill('UndoBob');
    await page.getByRole('button', { name: 'Add player' }).click();
    await expect(page.getByText('UndoBob')).toBeVisible();

    // ── 3. Start a Skyjo game ─────────────────────────────────────────────────
    await startGameViaUi(page, 'skyjo', ['UndoAlice', 'UndoBob']);
    await expect(page.locator('.score-sheet')).toBeVisible();

    // ── 4. Enter Round 1 scores ───────────────────────────────────────────────
    // UndoAlice=10, UndoBob=20
    await page.locator('input[aria-label="Round score for UndoAlice"]').fill('10');
    await page.locator('input[aria-label="Round score for UndoBob"]').fill('20');
    await page.locator('button.ended-round-toggle').first().click();
    await page.getByRole('button', { name: 'Save Round' }).click();
    await expect(page.locator('.score-sheet__header')).toContainText('Round 2');

    // After round 1: UndoAlice=10 (leader, low-wins)
    await expect(page.locator('.totals-table__row--leader')).toContainText('UndoAlice');

    // ── 5. Enter Round 2 scores ───────────────────────────────────────────────
    // UndoAlice=30, UndoBob=5 — big round 2 for Alice, small for Bob
    await page.locator('input[aria-label="Round score for UndoAlice"]').fill('30');
    await page.locator('input[aria-label="Round score for UndoBob"]').fill('5');
    await page.locator('button.ended-round-toggle').nth(1).click();
    await page.getByRole('button', { name: 'Save Round' }).click();
    await expect(page.locator('.score-sheet__header')).toContainText('Round 3');

    // After round 2: Alice=40, Bob=25 — Bob now leads (low-wins)
    await expect(page.locator('.totals-table__row--leader')).toContainText('UndoBob');

    // ── 6. Undo last round ────────────────────────────────────────────────────
    // "Undo last round" button should now be visible
    const undoBtn = page.getByRole('button', { name: /Undo last round/i });
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    // Confirm dialog should appear
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /Undo round/i }).click();

    // After undo: back to round 2 prompt, totals revert to round 1 state
    // UndoAlice=10 (leader), UndoBob=20
    await expect(page.locator('.score-sheet__header')).toContainText('Round 2');
    await expect(page.locator('.totals-table__row--leader')).toContainText('UndoAlice');

    // ── 7. Continue: save a new round 2 ──────────────────────────────────────
    // Now enter different round 2 scores: Alice=3, Bob=15
    await page.locator('input[aria-label="Round score for UndoAlice"]').fill('3');
    await page.locator('input[aria-label="Round score for UndoBob"]').fill('15');
    await page.locator('button.ended-round-toggle').first().click();
    await page.getByRole('button', { name: 'Save Round' }).click();
    await expect(page.locator('.score-sheet__header')).toContainText('Round 3');

    // After new round 2: Alice=13, Bob=35 — Alice leads again
    await expect(page.locator('.totals-table__row--leader')).toContainText('UndoAlice');

    // ── 8. Finish the game ────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Finish Game' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Finish Game' }).click();

    await expect(page).toHaveURL(/\/play\/[^/]+\/results$/);

    // UndoAlice wins (lowest total 13 vs Bob's 35)
    const winnerRow = page.locator('.results-table__row--winner');
    await expect(winnerRow).toBeVisible();
    await expect(winnerRow).toContainText('UndoAlice');
    await expect(winnerRow).toContainText('#1');
    await expect(winnerRow.locator('.results-table__win-badge')).toBeVisible();
  });
});
