/**
 * Shared helpers for e2e tests.
 */
import { type Page, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Start a new game via the new start-game UX (dropdown + count buttons + seat selects).
 *
 * Navigates to /play/new, selects the module, clicks the player-count button matching
 * the number of nicknames provided, fills each seat select in order, clicks Start game,
 * and asserts the URL is /play/<id>.
 */
export async function startGameViaUi(
  page: Page,
  moduleId: string,
  playerNicknames: string[],
): Promise<void> {
  await page.goto('/play/new');
  // All games are pre-release by default; enable the toggle so they appear in the picker.
  const toggle = page.locator('#show-pre-release');
  if (!(await toggle.isChecked())) {
    await toggle.click();
  }
  await page.locator('#game-select').selectOption(moduleId);
  await page
    .getByRole('button', { name: String(playerNicknames.length), exact: true })
    .click();
  for (let i = 0; i < playerNicknames.length; i++) {
    await page.locator(`#slot-${i}`).selectOption({ label: playerNicknames[i] });
  }
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page).toHaveURL(/\/play\/[^/]+$/);
}

export interface TestCreds {
  adminEmail: string;
  adminPassword: string;
  adminFullName: string;
  adminNickname: string;
}

export function getTestCreds(): TestCreds {
  const credsPath = path.join(__dirname, '.env.e2e.json');
  return JSON.parse(fs.readFileSync(credsPath, 'utf-8')) as TestCreds;
}

/**
 * Run the install wizard via the UI and log in as the new super admin.
 * Skips if setup is already complete (so tests can be run individually).
 */
export async function runSetupIfNeeded(page: Page, creds: TestCreds): Promise<void> {
  // Check setup status via API
  const res = await page.request.get('/api/setup/status');
  const status = await res.json();
  if (status.setupComplete) {
    return;
  }

  await page.goto('/setup');
  await page.getByLabel('Full name').fill(creds.adminFullName);
  await page.getByLabel('Nickname').fill(creds.adminNickname);
  await page.getByLabel('Email').fill(creds.adminEmail);
  await page.getByLabel('Password').fill(creds.adminPassword);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Should redirect to dashboard after setup + auto-login
  await expect(page).toHaveURL('/');
}

/**
 * Log in via the UI login form.
 */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}
