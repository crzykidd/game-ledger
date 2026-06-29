/**
 * Admin API — users, invites, resets, groups, audit, maintenance.
 * All calls go through the singleton apiClient (auto CSRF, structured errors).
 */
import { Permission, Role, UserState } from '@game-ledger/contract';
import type {
  MaintenanceSettings,
  UpdateMaintenanceSettingsBody,
  MaintenanceKind,
} from '@game-ledger/contract';
import { apiClient } from './client';

// ─── User types ───────────────────────────────────────────────────────────────

export interface UserListItem {
  id: string;
  email: string;
  nickname: string;
  fullName: string;
  role: Role;
  state: UserState;
  lastLoginAt: string | null;
  createdAt: string;
  groups: { group: { id: string; name: string } }[];
}

export interface PermissionOverride {
  permission: Permission;
  granted: boolean;
}

export interface UserDetail extends UserListItem {
  updatedAt: string;
  permOverrides: PermissionOverride[];
  effectivePermissions: Permission[];
}

// ─── Group types ──────────────────────────────────────────────────────────────

export interface GroupPermission {
  permission: Permission;
  granted: boolean;
}

export interface GroupMember {
  user: { id: string; nickname: string };
}

export interface Group {
  id: string;
  name: string;
  permissions: GroupPermission[];
  members: GroupMember[];
  createdAt: string;
}

// ─── Invite types ─────────────────────────────────────────────────────────────

export type InviteStatus = 'pending' | 'claimed' | 'expired' | 'revoked';

export interface InviteListItem {
  id: string;
  email: string | null;
  status: InviteStatus;
  createdBy: { id: string; nickname: string } | null;
  guestPlayer: { id: string; nickname: string } | null;
  claimedByUser: { id: string; nickname: string; email: string } | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface CreateInviteResult {
  id: string;
  email: string;
  expiresAt: string;
  link: string;
}

// ─── Reset types ──────────────────────────────────────────────────────────────

export type ResetStatus = 'pending' | 'claimed' | 'expired' | 'revoked';

export interface ResetListItem {
  id: string;
  target: { id: string; nickname: string; email: string } | null;
  claimed: boolean;
  status: ResetStatus;
  createdBy: { id: string; nickname: string } | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface CreateResetResult {
  id: string;
  targetUserId: string;
  expiresAt: string;
  link: string;
}

// ─── Audit types ──────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: { id: string; nickname: string } | null;
}

// ─── Users API ────────────────────────────────────────────────────────────────

export function listUsers(opts?: {
  includeDisabled?: boolean;
  search?: string;
}): Promise<UserListItem[]> {
  const params = new URLSearchParams();
  if (opts?.includeDisabled) params.set('includeDisabled', 'true');
  if (opts?.search) params.set('search', opts.search);
  const qs = params.toString();
  return apiClient.get<UserListItem[]>(`/api/users${qs ? `?${qs}` : ''}`);
}

export function getUser(id: string): Promise<UserDetail> {
  return apiClient.get<UserDetail>(`/api/users/${id}`);
}

export function patchUser(
  id: string,
  data: { role?: Role; nickname?: string; fullName?: string },
): Promise<UserDetail> {
  return apiClient.patch<UserDetail>(`/api/users/${id}`, data);
}

export function disableUser(id: string): Promise<UserDetail> {
  return apiClient.post<UserDetail>(`/api/users/${id}/disable`);
}

export function enableUser(id: string): Promise<UserDetail> {
  return apiClient.post<UserDetail>(`/api/users/${id}/enable`);
}

export function setUserPermissions(
  id: string,
  overrides: PermissionOverride[],
): Promise<UserDetail> {
  return apiClient.put<UserDetail>(`/api/users/${id}/permissions`, { overrides });
}

export function setUserGroups(id: string, groupIds: string[]): Promise<UserDetail> {
  return apiClient.put<UserDetail>(`/api/users/${id}/groups`, { groupIds });
}

export function createResetLink(userId: string): Promise<CreateResetResult> {
  return apiClient.post<CreateResetResult>(`/api/users/${userId}/reset-link`);
}

// ─── Invites API ──────────────────────────────────────────────────────────────

export function listInvites(): Promise<InviteListItem[]> {
  return apiClient.get<InviteListItem[]>('/api/invites');
}

export function createInvite(data: {
  email: string;
  guestPlayerId?: string;
}): Promise<CreateInviteResult> {
  return apiClient.post<CreateInviteResult>('/api/invites', data);
}

export function revokeInvite(id: string): Promise<void> {
  return apiClient.post<void>(`/api/invites/${id}/revoke`);
}

export function regenerateInvite(id: string): Promise<CreateInviteResult> {
  return apiClient.post<CreateInviteResult>(`/api/invites/${id}/regenerate`);
}

// ─── Resets API ───────────────────────────────────────────────────────────────

export function listResets(): Promise<ResetListItem[]> {
  return apiClient.get<ResetListItem[]>('/api/resets');
}

// ─── Groups API ───────────────────────────────────────────────────────────────

export function listGroups(): Promise<Group[]> {
  return apiClient.get<Group[]>('/api/groups');
}

export function createGroup(name: string): Promise<Group> {
  return apiClient.post<Group>('/api/groups', { name });
}

export function updateGroup(id: string, name: string): Promise<Group> {
  return apiClient.patch<Group>(`/api/groups/${id}`, { name });
}

export function deleteGroup(id: string): Promise<void> {
  return apiClient.delete<void>(`/api/groups/${id}`);
}

export function setGroupPermissions(id: string, permissions: GroupPermission[]): Promise<Group> {
  return apiClient.put<Group>(`/api/groups/${id}/permissions`, { permissions });
}

// ─── Audit API ────────────────────────────────────────────────────────────────

export function getAuditLog(limit = 100): Promise<AuditEntry[]> {
  return apiClient.get<AuditEntry[]>(`/api/audit?limit=${limit}`);
}

// ─── Maintenance API ──────────────────────────────────────────────────────────

export interface BackupItem {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export interface MaintenanceRunResult {
  kind: MaintenanceKind;
  durationMs: number;
  completedAt: string;
}

export type { MaintenanceSettings, UpdateMaintenanceSettingsBody, MaintenanceKind };

export function listBackups(): Promise<BackupItem[]> {
  return apiClient.get<BackupItem[]>('/api/maintenance/backups');
}

export function createBackup(): Promise<BackupItem> {
  return apiClient.post<BackupItem>('/api/maintenance/backups');
}

export function deleteBackup(name: string): Promise<void> {
  return apiClient.delete<void>(`/api/maintenance/backups/${encodeURIComponent(name)}`);
}

export function restoreBackup(name: string): Promise<void> {
  return apiClient.post<void>(`/api/maintenance/backups/${encodeURIComponent(name)}/restore`);
}

export function restoreFromUpload(file: File): Promise<{ restored: true }> {
  const csrfToken = document.cookie
    .split('; ')
    .find((row) => row.startsWith('gl_csrf='))
    ?.split('=')[1];
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {};
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  return fetch('/api/maintenance/restore', {
    method: 'POST',
    credentials: 'include',
    headers,
    body: form,
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new (await import('./client').then((m) => m.ApiClientError))({
        statusCode: res.status,
        message: typeof body.message === 'string' ? body.message : res.statusText,
      });
    }
    return res.json() as Promise<{ restored: true }>;
  });
}

export function getMaintenanceSettings(): Promise<MaintenanceSettings> {
  return apiClient.get<MaintenanceSettings>('/api/maintenance/settings');
}

export function updateMaintenanceSettings(
  body: UpdateMaintenanceSettingsBody,
): Promise<MaintenanceSettings> {
  return apiClient.put<MaintenanceSettings>('/api/maintenance/settings', body);
}

export function runMaintenance(kind: MaintenanceKind): Promise<MaintenanceRunResult> {
  return apiClient.post<MaintenanceRunResult>('/api/maintenance/run', { kind });
}
