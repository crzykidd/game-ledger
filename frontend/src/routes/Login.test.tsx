import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Login } from './Login';
import { AuthProvider } from '../auth/AuthContext';

const MOCK_USER = {
  id: 'user-1',
  email: 'test@example.com',
  nickname: 'tester',
  fullName: 'Test User',
  role: 'PLAYER',
  state: 'ACTIVE',
  themePref: 'SYSTEM',
  effectivePermissions: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route
          path="/login"
          element={
            <AuthProvider>
              <Login />
            </AuthProvider>
          }
        />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Login page', () => {
  it('form submit calls POST /api/auth/login', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ statusCode: 401, message: 'Unauthorized' }),
        });
      }
      if (url === '/api/auth/login') {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ message: 'Logged in.' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => MOCK_USER,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLogin();

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'MyPass1234!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    type FetchCall = [string, RequestInit];
    await waitFor(() => {
      const calls = fetchMock.mock.calls as FetchCall[];
      const loginCall = calls.find((c) => c[0] === '/api/auth/login');
      expect(loginCall).toBeTruthy();
      const body = JSON.parse(loginCall![1].body as string);
      expect(body.email).toBe('test@example.com');
      expect(body.password).toBe('MyPass1234!');
    });
  });

  it('shows lockout message when API returns locked error', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: async () => ({ statusCode: 401, message: 'Unauthorized' }),
        });
      }
      if (url === '/api/auth/login') {
        return Promise.resolve({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: async () => ({
            statusCode: 403,
            message:
              'Account is temporarily locked due to too many failed login attempts. Try again in 900 seconds.',
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderLogin();

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/email/i), 'test@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByRole('alert').textContent).toMatch(/locked/i);
  });
});
