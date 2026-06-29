import { ThemePref } from '@game-ledger/contract';
import type { ApiClient } from '../api/client';

const STORAGE_KEY = 'gl_theme';

/**
 * Applies a ThemePref to the DOM.
 * - LIGHT  → data-theme="light"
 * - DARK   → data-theme="dark"
 * - SYSTEM → resolves the OS preference and sets data-theme to it explicitly
 *
 * We always set an explicit data-theme (never remove it for SYSTEM): Tailwind's dark mode
 * keys on the [data-theme="dark"] attribute and cannot respond to a media query, so relying
 * on @media would leave the new (Tailwind) screens light under system-dark.
 */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === ThemePref.LIGHT) {
    root.setAttribute('data-theme', 'light');
    localStorage.setItem(STORAGE_KEY, 'light');
  } else if (pref === ThemePref.DARK) {
    root.setAttribute('data-theme', 'dark');
    localStorage.setItem(STORAGE_KEY, 'dark');
  } else {
    // SYSTEM — resolve the OS preference and set it explicitly
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem(STORAGE_KEY, 'system');
  }
}

/**
 * Returns the currently applied theme ('light' or 'dark').
 * For SYSTEM preference this resolves the actual display mode.
 */
export function getCurrentTheme(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light') return 'light';
  if (attr === 'dark') return 'dark';
  // SYSTEM — check the media query
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Called on app init to apply the stored theme before the user is loaded from API.
 * Reads 'gl_theme' from localStorage to prevent flash of wrong theme.
 */
export function initTheme(): void {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else if (stored === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    // 'system' or null — resolve the OS preference explicitly (Tailwind can't read @media)
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  // While in SYSTEM mode, follow OS theme changes live.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if ((localStorage.getItem(STORAGE_KEY) ?? 'system') === 'system') {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
}

/**
 * Persists the user's theme preference via the API, then applies it locally.
 */
export async function setThemePref(pref: ThemePref, apiClient: ApiClient): Promise<void> {
  // Optimistically apply first
  applyTheme(pref);
  // Then persist to API
  await apiClient.patch('/api/auth/me', { themePref: pref });
}
