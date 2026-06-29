import React from 'react';
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { ToastProvider } from '../components/ui/Toast';
import { AdminLayout } from './AdminLayout';
import { AdminUsers } from './AdminUsers';
import { AdminUserDetail } from './AdminUserDetail';
import { AdminInvites } from './AdminInvites';
import { AdminResets } from './AdminResets';
import { AdminGroups } from './AdminGroups';
import { AdminMaintenance } from './AdminMaintenance';
import { Permission, Role, UserState } from '@game-ledger/contract';

// ─── Shared mock helpers ──────────────────────────────────────────────────────

function makeUser(overrides: Partial<ReturnType<typeof baseUser>> = {}) {
  return { ...baseUser(), ...overrides };
}

function baseUser() {
  return {
    id: 'user-1',
    email: 'admin@example.com',
    nickname: 'admin',
    fullName: 'Admin User',
    role: Role.SUPER_ADMIN,
    state: 'ACTIVE',
    themePref: 'SYSTEM',
    effectivePermissions: Object.values(Permission),
  };
}

function baseUserListItem() {
  return {
    id: 'u-1',
    email: 'alice@example.com',
    nickname: 'alice',
    fullName: 'Alice Smith',
    role: Role.PLAYER,
    state: UserState.ACTIVE,
    lastLoginAt: '2026-06-24T10:00:00Z',
    createdAt: '2026-06-01T00:00:00Z',
    groups: [],
  };
}

function baseUserDetail() {
  return {
    ...baseUserListItem(),
    updatedAt: '2026-06-24T10:00:00Z',
    permOverrides: [],
    effectivePermissions: [Permission.CREATE_GAME, Permission.INVITE_USERS],
  };
}

function baseInvite(status = 'pending') {
  return {
    id: 'inv-1',
    email: 'bob@example.com',
    status,
    createdBy: { id: 'user-1', nickname: 'admin' },
    guestPlayer: null,
    claimedByUser: null,
    createdAt: '2026-06-24T10:00:00Z',
    expiresAt: '2026-06-25T10:00:00Z',
    consumedAt: null,
  };
}

function baseReset() {
  return {
    id: 'rst-1',
    target: { id: 'u-1', nickname: 'alice', email: 'alice@example.com' },
    claimed: false,
    status: 'pending',
    createdBy: { id: 'user-1', nickname: 'admin' },
    createdAt: '2026-06-24T10:00:00Z',
    expiresAt: '2026-06-25T10:00:00Z',
    consumedAt: null,
  };
}

function baseGroup() {
  return {
    id: 'grp-1',
    name: 'No-Invite',
    permissions: [{ permission: Permission.INVITE_USERS, granted: false }],
    members: [],
    createdAt: '2026-06-01T00:00:00Z',
  };
}

// ─── Setup helpers ────────────────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(handler: (url: string, opts?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      const body = handler(url, opts);
      if (body === null) {
        return {
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: async () => ({ statusCode: 403, message: 'Forbidden' }),
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => body,
      };
    }),
  );
}

function renderWithProviders(element: React.ReactNode, initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ToastProvider>
        <AuthProvider>{element}</AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Admin: users list', () => {
  it('renders the users list table', async () => {
    stubFetch((url) => {
      if (url === '/api/auth/me') return baseUser();
      if (url.startsWith('/api/users')) return [baseUserListItem()];
      return {};
    });

    renderWithProviders(<AdminUsers />, '/admin/users');

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });
    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('show-disabled toggle passes includeDisabled param to the query', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      // Return different data based on whether includeDisabled is in the URL
      const data = url.includes('includeDisabled=true')
        ? [
            baseUserListItem(),
            { ...baseUserListItem(), id: 'u-2', nickname: 'bob', state: UserState.DISABLED },
          ]
        : [baseUserListItem()];
      return { ok: true, status: 200, json: async () => data };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AdminUsers />, '/admin/users');

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    // Initially 1 user shown
    expect(screen.queryByText('bob')).not.toBeInTheDocument();

    // Toggle show disabled
    const toggle = screen.getByLabelText('Show disabled users');
    await userEvent.click(toggle);

    // Now both users should be shown
    await waitFor(() => {
      expect(screen.getByText('bob')).toBeInTheDocument();
    });

    // Verify the second call included includeDisabled=true
    const calls = fetchMock.mock.calls as [string, RequestInit][];
    const withDisabled = calls.find(([url]) => url.includes('includeDisabled=true'));
    expect(withDisabled).toBeTruthy();
  });
});

describe('Admin: permission gating hides admin nav', () => {
  it('redirects to / when user has no admin permissions', async () => {
    stubFetch((url) => {
      if (url === '/api/auth/me') {
        return makeUser({
          role: Role.PLAYER,
          effectivePermissions: [Permission.CREATE_GAME],
        });
      }
      return {};
    });

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<div>home</div>} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="users" element={<AdminUsers />} />
              </Route>
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('home')).toBeInTheDocument();
    });
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });
});

describe('Admin: create invite and copyable link', () => {
  it('create-invite flow shows a copyable link in the modal', async () => {
    const inviteLink = 'http://localhost:5173/invite/accept/test-token-abc';
    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/invites' && opts?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 'inv-new',
            email: 'charlie@example.com',
            expiresAt: '2026-06-25T10:00:00Z',
            link: inviteLink,
          }),
        };
      }
      if (url === '/api/invites') {
        return { ok: true, status: 200, json: async () => [] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    // Stub clipboard
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    renderWithProviders(<AdminInvites />, '/admin/invites');

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create invite' })).toBeInTheDocument();
    });

    // Open create modal
    await userEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    });

    // Fill in email and submit
    await userEvent.type(screen.getByLabelText('Email address'), 'charlie@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Create & get link' }));

    // The link modal should open with the copyable link
    await waitFor(() => {
      expect(screen.getByLabelText('Generated link')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(inviteLink)).toBeInTheDocument();

    // Click copy button
    await userEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));
    expect(writeText).toHaveBeenCalledWith(inviteLink);
  });

  it('invite list reflects status column', async () => {
    stubFetch((url) => {
      if (url === '/api/auth/me') return baseUser();
      if (url === '/api/invites') return [baseInvite('claimed'), baseInvite('revoked')];
      return {};
    });

    renderWithProviders(<AdminInvites />, '/admin/invites');

    await waitFor(() => {
      expect(screen.getByText('Claimed')).toBeInTheDocument();
    });
    expect(screen.getByText('Revoked')).toBeInTheDocument();
  });
});

describe('Admin: generate reset link', () => {
  it('generate reset link shows a copyable link in a modal', async () => {
    const resetLinkUrl = 'http://localhost:5173/reset/reset-token-xyz';
    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === `/api/users/u-1`) {
        return { ok: true, status: 200, json: async () => baseUserDetail() };
      }
      if (url === '/api/groups') {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url.endsWith('/reset-link') && opts?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: 'rst-new',
            targetUserId: 'u-1',
            expiresAt: '2026-06-25T10:00:00Z',
            link: resetLinkUrl,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    // Stub clipboard
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(
      <MemoryRouter initialEntries={['/admin/users/u-1']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/admin/users/:id" element={<AdminUserDetail />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    // Click generate reset link button
    const resetBtn = screen.getByRole('button', { name: 'Generate reset link' });
    await userEvent.click(resetBtn);

    // Modal should show with the copyable link
    await waitFor(() => {
      expect(screen.getByText('Password reset link')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue(resetLinkUrl)).toBeInTheDocument();

    // Copy button works
    await userEvent.click(screen.getByRole('button', { name: 'Copy reset link' }));
    expect(writeText).toHaveBeenCalledWith(resetLinkUrl);
  });
});

describe('Admin: tier-aware UI', () => {
  it('hides manage actions when actor cannot act on target (equal/higher tier)', async () => {
    // Admin (tier 1) looking at another Admin (tier 1) — cannot act on equal tier
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return {
          ok: true,
          status: 200,
          json: async () =>
            makeUser({
              role: Role.ADMIN,
              effectivePermissions: [
                Permission.MANAGE_USERS,
                Permission.SEND_PASSWORD_RESET,
                Permission.VIEW_ALL,
              ],
            }),
        };
      }
      if (url.startsWith('/api/users/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...baseUserDetail(),
            role: Role.ADMIN, // same tier as actor
          }),
        };
      }
      if (url === '/api/groups') {
        return { ok: true, status: 200, json: async () => [] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/admin/users/u-1']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/admin/users/:id" element={<AdminUserDetail />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('alice')).toBeInTheDocument();
    });

    // Actions on equal-tier user should be hidden (canActOn returns false for equal tier)
    expect(screen.queryByRole('button', { name: 'Change role' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disable account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate reset link' })).not.toBeInTheDocument();
  });
});

describe('Admin: group create + permission edit', () => {
  it('renders groups list and opens create group modal', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/groups' && opts?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            ...baseGroup(),
            id: 'grp-2',
            name: 'Can-Reset',
            permissions: [],
            members: [],
          }),
        };
      }
      if (url === '/api/groups') {
        return { ok: true, status: 200, json: async () => [baseGroup()] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AdminGroups />, '/admin/groups');

    // Wait for group to appear
    await waitFor(() => {
      expect(screen.getByText('No-Invite')).toBeInTheDocument();
    });

    // Open create group modal
    await userEvent.click(screen.getByRole('button', { name: 'Create group' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Group name')).toBeInTheDocument();
    });

    // Type name and submit
    await userEvent.type(screen.getByLabelText('Group name'), 'Can-Reset');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    // Should call POST /api/groups
    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const createCall = calls.find(
        ([url, opts]) => url === '/api/groups' && opts?.method === 'POST',
      );
      expect(createCall).toBeTruthy();
      const body = JSON.parse(createCall![1].body as string);
      expect(body.name).toBe('Can-Reset');
    });
  });

  it('opens permission edit modal for a group', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url.includes('/permissions') && opts?.method === 'PUT') {
        return {
          ok: true,
          status: 200,
          json: async () => baseGroup(),
        };
      }
      if (url === '/api/groups') {
        return { ok: true, status: 200, json: async () => [baseGroup()] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AdminGroups />, '/admin/groups');

    await waitFor(() => {
      expect(screen.getByText('No-Invite')).toBeInTheDocument();
    });

    // Open permissions modal
    await userEvent.click(screen.getByRole('button', { name: 'Permissions' }));
    await waitFor(() => {
      expect(screen.getByText(/Permissions — No-Invite/)).toBeInTheDocument();
    });

    // Permissions should be listed
    expect(screen.getByText('INVITE_USERS')).toBeInTheDocument();

    // Save permissions
    await userEvent.click(screen.getByRole('button', { name: 'Save permissions' }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const permCall = calls.find(
        ([url, opts]) => url.includes('/permissions') && opts?.method === 'PUT',
      );
      expect(permCall).toBeTruthy();
    });
  });
});

describe('Admin: resets list', () => {
  it('renders the resets list with claimed status', async () => {
    const claimedReset = { ...baseReset(), status: 'claimed', claimed: true };
    stubFetch((url) => {
      if (url === '/api/auth/me') return baseUser();
      if (url === '/api/resets') return [baseReset(), claimedReset];
      return {};
    });

    renderWithProviders(<AdminResets />, '/admin/resets');

    await waitFor(() => {
      expect(screen.getAllByText('alice').length).toBeGreaterThan(0);
    });

    // Both status values should be visible
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });
});

describe('AdminLayout: tab visibility', () => {
  beforeEach(() => {
    // Silence navigator.clipboard errors in jsdom
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  it('only shows tabs for permissions the user holds', async () => {
    stubFetch((url) => {
      if (url === '/api/auth/me') {
        return makeUser({
          role: Role.MANAGER,
          effectivePermissions: [
            Permission.INVITE_USERS,
            Permission.MANAGE_USERS,
            Permission.VIEW_ALL,
          ],
        });
      }
      if (url.startsWith('/api/users')) return [];
      return {};
    });

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="users" element={<AdminUsers />} />
                <Route path="invites" element={<div>invites</div>} />
                <Route path="resets" element={<div>resets</div>} />
                <Route path="groups" element={<div>groups</div>} />
                <Route path="audit" element={<div>audit</div>} />
                <Route path="maintenance" element={<div>maintenance</div>} />
              </Route>
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      // The "Users" tab nav link should be visible
      expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
    });

    // Should see nav link tabs for permissions held
    expect(screen.getByRole('link', { name: 'Invites' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit log' })).toBeInTheDocument();

    // Should NOT see Groups tab (requires MANAGE_GROUPS_ROLES which Manager doesn't have)
    expect(screen.queryByRole('link', { name: 'Groups' })).not.toBeInTheDocument();
    // Should NOT see Resets tab (requires SEND_PASSWORD_RESET which Manager doesn't have by default)
    expect(screen.queryByRole('link', { name: 'Resets' })).not.toBeInTheDocument();
    // Should NOT see Maintenance tab (requires MANAGE_GLOBAL_SETTINGS which Manager doesn't have)
    expect(screen.queryByRole('link', { name: 'Maintenance' })).not.toBeInTheDocument();
  });

  it('shows Maintenance tab when user has MANAGE_GLOBAL_SETTINGS', async () => {
    stubFetch((url) => {
      if (url === '/api/auth/me') {
        return makeUser({
          role: Role.SUPER_ADMIN,
          effectivePermissions: Object.values(Permission),
        });
      }
      if (url.startsWith('/api/maintenance/backups')) return [];
      if (url.startsWith('/api/maintenance/settings'))
        return {
          backupEnabled: false,
          backupCron: null,
          backupRetention: 0,
          reindexEnabled: false,
          reindexCron: null,
          createdAt: '2026-06-26T00:00:00Z',
          updatedAt: '2026-06-26T00:00:00Z',
        };
      if (url.startsWith('/api/users')) return [];
      return {};
    });

    render(
      <MemoryRouter initialEntries={['/admin/users']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="users" element={<AdminUsers />} />
                <Route path="maintenance" element={<div>maintenance</div>} />
              </Route>
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Maintenance' })).toBeInTheDocument();
    });
  });
});

// ─── AdminMaintenance tests ───────────────────────────────────────────────────

function baseMaintenanceSettings() {
  return {
    backupEnabled: false,
    backupCron: null,
    backupRetention: 0,
    reindexEnabled: false,
    reindexCron: null,
    createdAt: '2026-06-26T00:00:00Z',
    updatedAt: '2026-06-26T00:00:00Z',
  };
}

function baseBackup(n = 1) {
  return {
    name: `backup-${n}.dump`,
    sizeBytes: 1024 * n,
    createdAt: `2026-06-2${n}T03:00:00Z`,
  };
}

describe('AdminMaintenance: backup list', () => {
  it('renders backup list and Create backup issues POST', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/maintenance/backups' && (!opts?.method || opts.method === 'GET')) {
        return { ok: true, status: 200, json: async () => [baseBackup(1), baseBackup(2)] };
      }
      if (url === '/api/maintenance/backups' && opts?.method === 'POST') {
        return { ok: true, status: 201, json: async () => baseBackup(3) };
      }
      if (url === '/api/maintenance/settings') {
        return { ok: true, status: 200, json: async () => baseMaintenanceSettings() };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AdminMaintenance />, '/admin/maintenance');

    // Backup list renders
    await waitFor(() => {
      expect(screen.getByText('backup-1.dump')).toBeInTheDocument();
    });
    expect(screen.getByText('backup-2.dump')).toBeInTheDocument();

    // Create backup button exists and fires POST
    const createBtn = screen.getByRole('button', { name: 'Create backup' });
    await userEvent.click(createBtn);

    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const postCall = calls.find(
        ([url, opts]) => url === '/api/maintenance/backups' && opts?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });
});

describe('AdminMaintenance: settings form', () => {
  it('loads settings from GET and PUTs on save', async () => {
    const settingsData = {
      ...baseMaintenanceSettings(),
      backupEnabled: true,
      backupCron: '0 3 * * *',
      backupRetention: 7,
    };
    const fetchMock = vi.fn().mockImplementation(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') {
        return { ok: true, status: 200, json: async () => baseUser() };
      }
      if (url === '/api/maintenance/backups') {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url === '/api/maintenance/settings' && (!opts?.method || opts.method === 'GET')) {
        return { ok: true, status: 200, json: async () => settingsData };
      }
      if (url === '/api/maintenance/settings' && opts?.method === 'PUT') {
        return { ok: true, status: 200, json: async () => settingsData };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AdminMaintenance />, '/admin/maintenance');

    // Settings form loads from GET — backup cron value appears
    await waitFor(() => {
      const cronInput = screen.getByLabelText('Backup cron') as HTMLInputElement;
      expect(cronInput.value).toBe('0 3 * * *');
    });

    // Click save
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as [string, RequestInit][];
      const putCall = calls.find(
        ([url, opts]) => url === '/api/maintenance/settings' && opts?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
    });
  });
});

describe('AdminMaintenance: SUPER_ADMIN-only controls', () => {
  it('hides Restore and upload-restore controls for non-super admin', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === '/api/auth/me') {
        return {
          ok: true,
          status: 200,
          json: async () =>
            makeUser({
              role: Role.ADMIN,
              effectivePermissions: [Permission.MANAGE_GLOBAL_SETTINGS],
            }),
        };
      }
      if (url === '/api/maintenance/backups') {
        return { ok: true, status: 200, json: async () => [baseBackup(1)] };
      }
      if (url === '/api/maintenance/settings') {
        return { ok: true, status: 200, json: async () => baseMaintenanceSettings() };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<AdminMaintenance />, '/admin/maintenance');

    // Wait for backup list to load
    await waitFor(() => {
      expect(screen.getByText('backup-1.dump')).toBeInTheDocument();
    });

    // SUPER_ADMIN-only: per-row Restore button should be absent for non-super admin
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();

    // SUPER_ADMIN-only: upload restore section should be absent
    expect(screen.queryByLabelText('Backup file')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore from upload' })).not.toBeInTheDocument();
  });
});
