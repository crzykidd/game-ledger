import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AcceptInvite } from './AcceptInvite';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAcceptInvite(token = 'test-token-abc') {
  return render(
    <MemoryRouter initialEntries={[`/invite/${token}`]}>
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

type FetchCall = [string, RequestInit];

describe('AcceptInvite page', () => {
  it('calls GET /api/invites/accept/:token on mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ email: 'invited@example.com' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAcceptInvite('abc123');

    await waitFor(() => {
      const calls = fetchMock.mock.calls as FetchCall[];
      const getCall = calls.find((c) => c[0] === '/api/invites/accept/abc123');
      expect(getCall).toBeTruthy();
      expect(getCall![1].method).toBe('GET');
    });
  });

  it('renders with email from prefill and submits POST', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, opts: RequestInit) => {
      if (opts.method === 'GET' || !opts.method) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ email: 'invited@example.com' }),
        });
      }
      // POST
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ message: 'Account created.' }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAcceptInvite('mytoken');

    await waitFor(() => {
      expect(screen.getByText(/invited@example\.com/)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/full name/i), 'Jane Doe');
    await userEvent.type(screen.getByLabelText(/nickname/i), 'jane');
    await userEvent.type(screen.getByLabelText(/password/i), 'Password1234!');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as FetchCall[];
      const postCall = calls.find(
        (c) => c[0] === '/api/invites/accept/mytoken' && c[1].method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall![1].body as string);
      expect(body.fullName).toBe('Jane Doe');
      expect(body.nickname).toBe('jane');
      expect(body.password).toBe('Password1234!');
    });
  });
});
