import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PasswordReset } from './PasswordReset';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPasswordReset(token = 'reset-token-xyz') {
  return render(
    <MemoryRouter initialEntries={[`/reset/${token}`]}>
      <Routes>
        <Route path="/reset/:token" element={<PasswordReset />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

type FetchCall = [string, RequestInit];

describe('PasswordReset page', () => {
  it('calls GET /api/resets/:token on mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ email: 'user@example.com' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPasswordReset('reset123');

    await waitFor(() => {
      const calls = fetchMock.mock.calls as FetchCall[];
      const getCall = calls.find((c) => c[0] === '/api/resets/reset123');
      expect(getCall).toBeTruthy();
      expect(getCall![1].method).toBe('GET');
    });
  });

  it('renders email and submits POST /api/resets/:token', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      if (opts.method === 'GET' || !opts.method) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ email: 'user@example.com' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ message: 'Password reset.' }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPasswordReset('myresettoken');

    await waitFor(() => {
      expect(screen.getByText(/user@example\.com/)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/new password/i), 'NewSecure1!');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as FetchCall[];
      const postCall = calls.find(
        (c) => c[0] === '/api/resets/myresettoken' && c[1].method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall![1].body as string);
      expect(body.password).toBe('NewSecure1!');
    });
  });
});
