import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Permission, Role, UserState } from '@game-ledger/contract';
import {
  getUser,
  disableUser,
  enableUser,
  patchUser,
  setUserPermissions,
  setUserGroups,
  createResetLink,
  listGroups,
  UserDetail,
  Group,
} from '../api/admin';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { cn } from '../components/ui/utils';
import { useToast } from '../components/ui/Toast';
import { ApiClientError } from '../api/client';
import { canActOn, roleLabel, assignableRoles } from './tier';
import { CopyLink } from './CopyLink';

function stateLabel(state: UserState): string {
  switch (state) {
    case UserState.ACTIVE:
      return 'Active';
    case UserState.PENDING:
      return 'Pending';
    case UserState.DISABLED:
      return 'Disabled';
  }
}

const ALL_PERMISSIONS = Object.values(Permission);

export function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser, hasPermission } = useAuth();
  const { toast } = useToast();

  const [user, setUser] = useState<UserDetail | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<Role | ''>('');

  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const actorRole = currentUser?.role as Role | undefined;
  const canActOnTarget = user && actorRole ? canActOn(actorRole, user.role) : false;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [userData, groupsData] = await Promise.all([getUser(id), listGroups()]);
      setUser(userData);
      setGroups(groupsData);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load user';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDisableEnable() {
    if (!user || !id) return;
    const isDisabled = user.state === UserState.DISABLED;
    const action = isDisabled ? 'enable' : 'disable';
    if (
      !isDisabled &&
      !confirm(`Disable account for ${user.nickname}? They will be logged out immediately.`)
    )
      return;
    setActionLoading(true);
    try {
      const updated = isDisabled ? await enableUser(id) : await disableUser(id);
      setUser(updated);
      toast(`Account ${action}d`, 'success');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : `Failed to ${action} user`;
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRoleChange() {
    if (!id || !pendingRole) return;
    setActionLoading(true);
    try {
      const updated = await patchUser(id, { role: pendingRole as Role });
      setUser(updated);
      setRoleModalOpen(false);
      toast('Role updated', 'success');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to update role';
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePermissionToggle(perm: Permission, currentGranted: boolean | null) {
    if (!user || !id) return;
    const existing = user.permOverrides.filter((o) => o.permission !== perm);
    let newOverrides: { permission: Permission; granted: boolean }[];
    if (currentGranted === null) {
      newOverrides = [...existing, { permission: perm, granted: false }];
    } else if (currentGranted === true) {
      newOverrides = [...existing, { permission: perm, granted: false }];
    } else {
      newOverrides = existing;
    }
    setActionLoading(true);
    try {
      const updated = await setUserPermissions(id, newOverrides);
      setUser(updated);
      toast('Permissions updated', 'success');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to update permissions';
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleGroupToggle(groupId: string, isMember: boolean) {
    if (!user || !id) return;
    const currentGroupIds = user.groups.map((g) => g.group.id);
    const newGroupIds = isMember
      ? currentGroupIds.filter((gid) => gid !== groupId)
      : [...currentGroupIds, groupId];
    setActionLoading(true);
    try {
      const updated = await setUserGroups(id, newGroupIds);
      setUser(updated);
      toast('Groups updated', 'success');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to update groups';
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleGenerateResetLink() {
    if (!id) return;
    setActionLoading(true);
    try {
      const result = await createResetLink(id);
      setResetLink(result.link);
      setResetModalOpen(true);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to generate reset link';
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div
          className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"
          aria-hidden
        />
      </div>
    );
  }

  if (!user) {
    return <p className="text-slate-500 dark:text-slate-400">User not found.</p>;
  }

  const memberGroupIds = new Set(user.groups.map((g) => g.group.id));

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => navigate('/admin/users')}
        className="self-start"
      >
        ← Back to Users
      </Button>

      {/* Profile card */}
      <Card>
        <CardHeader>
          <CardTitle>{user.nickname}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm mb-4">
            <dt className="text-slate-500 dark:text-slate-400">Full name</dt>
            <dd className="text-slate-900 dark:text-slate-100">{user.fullName}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Role</dt>
            <dd className="text-slate-900 dark:text-slate-100">{roleLabel(user.role)}</dd>
            <dt className="text-slate-500 dark:text-slate-400">State</dt>
            <dd className="text-slate-900 dark:text-slate-100">{stateLabel(user.state)}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Last login</dt>
            <dd className="text-slate-900 dark:text-slate-100">
              {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}
            </dd>
          </dl>

          {canActOnTarget && (
            <div className="flex flex-wrap gap-2 mt-4">
              {hasPermission(Permission.MANAGE_USERS) && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setPendingRole(user.role);
                      setRoleModalOpen(true);
                    }}
                    disabled={actionLoading}
                  >
                    Change role
                  </Button>
                  <Button
                    variant={user.state === UserState.DISABLED ? 'primary' : 'danger'}
                    size="sm"
                    onClick={handleDisableEnable}
                    loading={actionLoading}
                  >
                    {user.state === UserState.DISABLED ? 'Enable account' : 'Disable account'}
                  </Button>
                </>
              )}
              {hasPermission(Permission.SEND_PASSWORD_RESET) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateResetLink}
                  loading={actionLoading}
                >
                  Generate reset link
                </Button>
              )}
            </div>
          )}
          {!canActOnTarget && currentUser?.id !== user.id && (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              You cannot manage accounts at or above your tier.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Permission overrides */}
      {hasPermission(Permission.MANAGE_USERS) && canActOnTarget && (
        <Card>
          <CardHeader>
            <CardTitle>Permission overrides</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              Overrides take precedence over role defaults and group settings. &ldquo;—&rdquo; =
              role default applies.
            </p>
            <div className="flex flex-col gap-2">
              {ALL_PERMISSIONS.map((perm) => {
                const override = user.permOverrides.find((o) => o.permission === perm);
                const overrideState = override === undefined ? null : override.granted;
                const effective = user.effectivePermissions.includes(perm);
                return (
                  <div
                    key={perm}
                    className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/40"
                  >
                    <span className="flex-1 text-sm font-mono text-slate-800 dark:text-slate-200">
                      {perm}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 min-w-[80px]">
                      {overrideState === null ? '—' : overrideState ? 'Granted' : 'Denied'}
                    </span>
                    <span
                      className={cn(
                        'text-xs min-w-[70px]',
                        effective
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400',
                      )}
                    >
                      {effective ? '✓ Active' : '✗ Off'}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handlePermissionToggle(perm, overrideState)}
                      disabled={actionLoading}
                    >
                      {overrideState === null ? 'Deny' : overrideState ? 'Deny' : 'Remove override'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Group membership */}
      {hasPermission(Permission.MANAGE_USERS) && canActOnTarget && (
        <Card>
          <CardHeader>
            <CardTitle>Group membership</CardTitle>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">No groups defined yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {groups.map((group) => {
                  const isMember = memberGroupIds.has(group.id);
                  return (
                    <div
                      key={group.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-700/40"
                    >
                      <span className="flex-1 text-sm text-slate-900 dark:text-slate-100">
                        {group.name}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {group.members.length} member{group.members.length !== 1 ? 's' : ''}
                      </span>
                      <Button
                        variant={isMember ? 'danger' : 'secondary'}
                        size="sm"
                        onClick={() => handleGroupToggle(group.id, isMember)}
                        disabled={actionLoading}
                      >
                        {isMember ? 'Remove' : 'Add'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Role change modal */}
      <Dialog open={roleModalOpen} onClose={() => setRoleModalOpen(false)} title="Change role">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Changing <strong>{user.nickname}</strong>&apos;s role. You can only assign roles below
            your own tier.
          </p>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="role-select"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              New role
            </label>
            <select
              id="role-select"
              value={pendingRole}
              onChange={(e) => setPendingRole(e.target.value as Role)}
              className={cn(
                'w-full rounded-xl border px-3 py-2 text-sm',
                'border-slate-200 dark:border-slate-600',
                'bg-white dark:bg-slate-800',
                'text-slate-900 dark:text-slate-100',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
              )}
            >
              {actorRole &&
                assignableRoles(actorRole).map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => setRoleModalOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleRoleChange} loading={actionLoading} disabled={!pendingRole}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Reset link modal */}
      <Dialog
        open={resetModalOpen}
        onClose={() => {
          setResetModalOpen(false);
          setResetLink(null);
        }}
        title="Password reset link"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Share this link with <strong>{user.nickname}</strong> via text or Signal. It expires in
            24 hours and is single-use.
          </p>
          {resetLink && <CopyLink link={resetLink} label="Copy reset link" />}
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setResetModalOpen(false);
                setResetLink(null);
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
