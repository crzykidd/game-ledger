import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

const MOCK_USER = {
  id: 'user-1',
  email: 'test@example.com',
  nickname: 'tester',
  fullName: 'Test User',
  role: 'PLAYER',
  state: 'ACTIVE',
  themePref: 'SYSTEM',
  effectivePermissions: ['CREATE_GAME'],
};

function setupFetchMock(meResponse: { ok: boolean; status: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: meResponse.ok,
      status: meResponse.status,
      statusText: meResponse.ok ? 'OK' : 'Unauthorized',
      json: async () => meResponse.body,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function UserDisplay() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading...</div>;
  if (!user) return <div>no user</div>;
  return <div>user: {user.nickname}</div>;
}

describe('AuthContext', () => {
  it('unauthenticated (401 from /me) results in user=null', async () => {
    setupFetchMock({ ok: false, status: 401, body: { statusCode: 401, message: 'Unauthorized' } });

    render(
      <MemoryRouter>
        <AuthProvider>
          <UserDisplay />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('no user')).toBeInTheDocument();
    });
  });

  it('authenticated user (/me 200) populates user', async () => {
    setupFetchMock({ ok: true, status: 200, body: MOCK_USER });

    render(
      <MemoryRouter>
        <AuthProvider>
          <UserDisplay />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('user: tester')).toBeInTheDocument();
    });
  });

  it('protected route redirects unauthenticated user to /login', async () => {
    setupFetchMock({ ok: false, status: 401, body: { statusCode: 401, message: 'Unauthorized' } });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Protected content</div>
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<div>login page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('login page')).toBeInTheDocument();
    });
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
