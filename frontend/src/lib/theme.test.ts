import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemePref } from '@game-ledger/contract';
import { applyTheme, getCurrentTheme, initTheme } from './theme';

// Store original matchMedia
const originalMatchMedia = window.matchMedia;

function mockMediaQuery(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: prefersDark && query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
  // Restore matchMedia
  Object.defineProperty(window, 'matchMedia', { writable: true, value: originalMatchMedia });
});

describe('applyTheme', () => {
  it('sets data-theme="light" for LIGHT pref', () => {
    applyTheme(ThemePref.LIGHT);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('gl_theme')).toBe('light');
  });

  it('sets data-theme="dark" for DARK pref', () => {
    applyTheme(ThemePref.DARK);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('gl_theme')).toBe('dark');
  });

  it('sets data-theme to the resolved OS theme for SYSTEM pref', () => {
    mockMediaQuery(true); // OS prefers dark
    document.documentElement.setAttribute('data-theme', 'light');
    applyTheme(ThemePref.SYSTEM);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('gl_theme')).toBe('system');
  });

  it('updates localStorage when applying theme', () => {
    applyTheme(ThemePref.DARK);
    expect(localStorage.getItem('gl_theme')).toBe('dark');

    applyTheme(ThemePref.LIGHT);
    expect(localStorage.getItem('gl_theme')).toBe('light');
  });
});

describe('getCurrentTheme', () => {
  it('returns "light" when data-theme is "light"', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(getCurrentTheme()).toBe('light');
  });

  it('returns "dark" when data-theme is "dark"', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(getCurrentTheme()).toBe('dark');
  });

  it('returns dark when no data-theme and system prefers dark', () => {
    document.documentElement.removeAttribute('data-theme');
    mockMediaQuery(true);
    expect(getCurrentTheme()).toBe('dark');
  });

  it('returns light when no data-theme and system prefers light', () => {
    document.documentElement.removeAttribute('data-theme');
    mockMediaQuery(false);
    expect(getCurrentTheme()).toBe('light');
  });
});

describe('initTheme', () => {
  it('sets data-theme="light" when localStorage contains "light"', () => {
    localStorage.setItem('gl_theme', 'light');
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sets data-theme="dark" when localStorage contains "dark"', () => {
    localStorage.setItem('gl_theme', 'dark');
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves to the OS theme (dark) when localStorage contains "system"', () => {
    mockMediaQuery(true); // OS prefers dark
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('gl_theme', 'system');
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('resolves to the OS theme (light) when localStorage is empty (system default)', () => {
    mockMediaQuery(false); // OS prefers light
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.clear();
    initTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
