/**
 * Cribbage happy path e2e — live pegging model (prompt 41).
 *
 * Covers:
 *  1. Login as super admin (wizard if needed)
 *  2. Create 3 guest players
 *  3. Start a 3-player Cribbage game via the start-game UX
 *  4. Board renders (data-testid="cribbage-board") with 3 player tracks
 *  5. CribbageCapture UI: +1/+2/+3, add field, End Deal, Undo (no Save Hand)
 *  6. Tapping +1 → board score-label updates immediately (live peg)
 *  7. Tapping +2 again → score-label updates again
 *  8. Undo last peg → score-label reverts by one peg
 *  9. End Deal → crib chip rotates to CribBob (deal 2)
 * 10. Skunk lines (61/91) + finish line (121) present
 * 11. Pushing a player to ≥121 mid-deal shows win banner + Finish Game
 * 12. Win state disables +1 buttons
 */
import { test, expect, type Page } from '@playwright/test';
import { getTestCreds, runSetupIfNeeded, loginAs, startGameViaUi } from './helpers';

const PLAYERS = ['CribAlice', 'CribBob', 'CribCarol'];

/** Click a quick-peg button for the given player name. */
async function tapPeg(page: Page, name: string, points: 1 | 2 | 3): Promise<void> {
  await page.locator(`button[aria-label="+${points} for ${name}"]`).click();
}

/** Enter a custom score via the add input and click Add. */
async function addCustomScore(page: Page, name: string, score: number): Promise<void> {
  const addInput = page.locator(`input[aria-label="Add points for ${name}"]`);
  await addInput.fill(String(score));
  await page.locator(`button[aria-label="Add custom points for ${name}"]`).click();
}

/**
 * Wait for a score-label (board SVG text, nth by seat) to show the expected total.
 * nth(0) = CribAlice (seat 0), nth(1) = CribBob, nth(2) = CribCarol.
 */
async function waitForScoreLabel(page: Page, seatIndex: number, expected: number): Promise<void> {
  await expect(page.locator('[data-testid^="score-label-"]').nth(seatIndex)).toHaveText(
    String(expected),
    { timeout: 10_000 },
  );
}

test.describe('Cribbage happy path (live pegging)', () => {
  test('3-player game: live pegs move board, undo reverts, End Deal rotates crib, mid-deal win', async ({
    page,
  }) => {
    const creds = getTestCreds();

    // ── 1. Login ──────────────────────────────────────────────────────────────
    await runSetupIfNeeded(page, creds);
    const meRes = await page.request.get('/api/auth/me');
    if (meRes.status() !== 200) {
      await loginAs(page, creds.adminEmail, creds.adminPassword);
    }
    await expect(page).toHaveURL('/');

    // ── 2. Create 3 guest players ─────────────────────────────────────────────
    await page.goto('/players');
    for (const name of PLAYERS) {
      await page.getByRole('button', { name: 'Add guest player' }).click();
      await page.getByLabel('Nickname').fill(name);
      await page.getByRole('button', { name: 'Add player' }).click();
      await expect(page.getByText(name)).toBeVisible();
    }

    // ── 3. Start a 3-player Cribbage game ────────────────────────────────────
    await startGameViaUi(page, 'cribbage', PLAYERS);

    // ── 4. Board renders for cribbage ─────────────────────────────────────────
    const board = page.locator('[data-testid="cribbage-board"]');
    await expect(board).toBeVisible();
    await expect(page.locator('[data-testid^="player-track-"]')).toHaveCount(3);

    // Skunk + finish lines present
    await expect(page.locator('[data-testid="skunk-line-61"]')).toBeVisible();
    await expect(page.locator('[data-testid="skunk-line-91"]')).toBeVisible();
    await expect(page.locator('[data-testid="finish-line-121"]')).toBeVisible();

    // ── 5. CribbageCapture UI — live model (End Deal, no Save Hand) ───────────
    await expect(page.getByTestId('end-deal-btn')).toBeVisible();
    await expect(page.getByRole('button', { name: /Save Hand/i })).not.toBeVisible();

    // Generic Score inputs should NOT be present
    await expect(page.locator('input[placeholder="Score"]')).not.toBeVisible();

    // +1/+2/+3 buttons present for each player
    for (const name of PLAYERS) {
      await expect(page.locator(`button[aria-label="+1 for ${name}"]`)).toBeVisible();
      await expect(page.locator(`button[aria-label="+2 for ${name}"]`)).toBeVisible();
      await expect(page.locator(`button[aria-label="+3 for ${name}"]`)).toBeVisible();
    }

    // Undo button present
    await expect(page.getByRole('button', { name: 'Undo last peg' })).toBeVisible();

    // ── 6. Dealer chip: deal 1 → CribAlice (seat 0) ────────────────────────────
    const cribLabel = page.locator('[data-testid="crib-label"]');
    await expect(cribLabel).toContainText("CribAlice's crib — Deal 1");

    // Initial score-labels should all show 0
    await waitForScoreLabel(page, 0, 0); // CribAlice

    // ── 7. Tap +1 for CribAlice → board peg moves to 1 immediately ───────────
    await tapPeg(page, 'CribAlice', 1);
    await waitForScoreLabel(page, 0, 1); // Alice: 1

    // Front peg should appear (total > 0)
    await expect(page.locator('[data-testid^="front-peg-"]')).toHaveCount(1);

    // ── 7b. Tap +2 for CribAlice → board updates to 3 ────────────────────────
    await tapPeg(page, 'CribAlice', 2);
    await waitForScoreLabel(page, 0, 3); // Alice: 3

    // ── 8. Undo → board reverts Alice to 1 ───────────────────────────────────
    await page.getByRole('button', { name: 'Undo last peg' }).click();
    await waitForScoreLabel(page, 0, 1); // Alice back to 1

    // ── 9. End Deal → crib chip rotates from CribAlice to CribBob ─────────────
    await page.getByTestId('end-deal-btn').click();
    await expect(cribLabel).toContainText("CribBob's crib — Deal 2", { timeout: 10_000 });

    // Alice still has 1 point (End Deal doesn't change scores)
    await waitForScoreLabel(page, 0, 1);

    // ── Accumulate scores for all three players across a few more deals ────────
    // Peg Alice: +3 → Alice: 4
    await tapPeg(page, 'CribAlice', 3);
    await waitForScoreLabel(page, 0, 4);

    // Peg Bob: +2 → Bob: 2
    await tapPeg(page, 'CribBob', 2);
    await waitForScoreLabel(page, 1, 2);

    // Peg Carol: +2 → Carol: 2
    await tapPeg(page, 'CribCarol', 2);
    await waitForScoreLabel(page, 2, 2);

    // Rear pegs should appear for Alice now (she's had at least 2 moves)
    await expect(page.locator('[data-testid^="rear-peg-"]').first()).toBeVisible();

    // End deal 2 → deal 3 (Carol, seat 2)
    await page.getByTestId('end-deal-btn').click();
    await expect(cribLabel).toContainText("CribCarol's crib — Deal 3", { timeout: 10_000 });

    // ── 11. Push Alice past 121 mid-deal → win banner + Finish Game ────────────
    // Current Alice = 4. Add 117 more → total 121 (≥ target).
    await addCustomScore(page, 'CribAlice', 117);

    // Win banner should appear
    await expect(page.locator('[data-testid="win-banner"]')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="win-banner-name"]')).toContainText('CribAlice wins!');

    // Finish Game button visible in banner
    await expect(page.locator('[data-testid="win-banner-finish-btn"]')).toBeVisible();

    // Undo in banner is also present (for mis-tap recovery)
    await expect(page.locator('[data-testid="win-banner-undo-btn"]')).toBeVisible();

    // ── 12. Win state: score buttons are gone (win banner replaced capture panel) ─
    // The capture panel (End Deal, +1 buttons) is replaced by the win banner.
    await expect(page.getByTestId('end-deal-btn')).not.toBeVisible();

    // Winner flag on board (exactly one player has ≥121)
    await expect(page.locator('[data-testid^="winner-flag-"]')).toHaveCount(1);

    // Alice's score-label should show 121
    await waitForScoreLabel(page, 0, 121);
  });
});
