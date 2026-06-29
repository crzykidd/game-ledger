import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VersionBadge } from './VersionBadge';

// __APP_VERSION__ is injected by vite.config.ts at test time from frontend/package.json.
// Vitest picks up the vite config `define` values, so the constant is always available.

describe('VersionBadge', () => {
  it('renders without crashing', () => {
    render(<VersionBadge />);
    expect(screen.getByTestId('version-badge')).toBeDefined();
  });

  it('displays a version string prefixed with "v"', () => {
    render(<VersionBadge />);
    const badge = screen.getByTestId('version-badge');
    // Text content must start with "v" followed by semver digits
    expect(badge.textContent).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('has an accessible aria-label containing the version', () => {
    render(<VersionBadge />);
    const badge = screen.getByTestId('version-badge');
    const label = badge.getAttribute('aria-label') ?? '';
    expect(label).toContain(__APP_VERSION__);
  });

  it('version constant is a non-empty semver string', () => {
    // Sanity-check that the build-time injection produced a real version,
    // not an empty string or a raw placeholder.
    expect(typeof __APP_VERSION__).toBe('string');
    expect(__APP_VERSION__.length).toBeGreaterThan(0);
    expect(__APP_VERSION__).toMatch(/^\d+\.\d+\.\d+/);
  });
});
