/**
 * Unit tests for the SetupGate routing component.
 *
 * Verifies that:
 *  - When setupComplete=false, the gate renders <Navigate to="/setup"> (not login/protected content).
 *  - When setupComplete=true, the gate renders its children.
 *  - When the API call fails, the gate shows an error UI (not protected content or login).
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouter } from './index';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetch(setupComplete: boolean) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/setup/status') {
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ setupComplete }),
      });
    }
    if (url === '/api/auth/me') {
      // Unauthenticated
      return Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ statusCode: 401, message: 'Unauthorized' }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({}),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mockFetchError() {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url === '/api/setup/status') {
      return Promise.reject(new TypeError('Network error'));
    }
    if (url === '/api/auth/me') {
      return Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ statusCode: 401, message: 'Unauthorized' }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('SetupGate', () => {
  it('redirects to /setup when setupComplete is false (fresh DB)', async () => {
    mockFetch(false);

    render(<AppRouter />);

    // Should NOT show login
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /sign in/i })).not.toBeInTheDocument();
    });

    // Should show the install wizard
    await waitFor(() => {
      expect(screen.getByText(/create your administrator account/i)).toBeInTheDocument();
    });
  });

  it('renders protected app when setupComplete is true and user is unauthenticated', async () => {
    mockFetch(true);

    render(<AppRouter />);

    // Unauthenticated user should land on /login (ProtectedRoute redirects there)
    await waitFor(() => {
      // The login form should be visible
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    // Should NOT show the install wizard
    expect(screen.queryByText(/create your administrator account/i)).not.toBeInTheDocument();
  });

  it('shows an error UI (not login or wizard) when the API call fails', async () => {
    mockFetchError();

    render(<AppRouter />);

    // Should show the error/retry UI
    await waitFor(() => {
      expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument();
    });

    // Should NOT redirect to login or show the install wizard
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/create your administrator account/i)).not.toBeInTheDocument();
  });

  it('retries and shows wizard after clicking Retry on error', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/setup/status') {
        callCount++;
        if (callCount === 1) {
          // First call fails
          return Promise.reject(new TypeError('Network error'));
        }
        // Subsequent calls succeed with setupComplete=false
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ setupComplete: false }),
        });
      }
      if (url === '/api/auth/me') {
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ statusCode: 401, message: 'Unauthorized' }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<AppRouter />);

    // Wait for error UI
    await waitFor(() => {
      expect(screen.getByText(/could not reach the server/i)).toBeInTheDocument();
    });

    // Click retry
    await user.click(screen.getByRole('button', { name: /retry/i }));

    // Should now show the install wizard
    await waitFor(() => {
      expect(screen.getByText(/create your administrator account/i)).toBeInTheDocument();
    });
  });
});
