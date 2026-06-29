import React, { useEffect, useState, useCallback } from 'react';
import { Permission } from '@game-ledger/contract';
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  setGroupPermissions,
  Group,
  GroupPermission,
} from '../api/admin';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { cn } from '../components/ui/utils';
import { useToast } from '../components/ui/Toast';
import { ApiClientError } from '../api/client';

const ALL_PERMISSIONS = Object.values(Permission);

export function AdminGroups() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [nameError, setNameError] = useState('');

  const [permGroup, setPermGroup] = useState<Group | null>(null);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [pendingPerms, setPendingPerms] = useState<GroupPermission[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listGroups();
      setGroups(data);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load groups';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditGroup(null);
    setGroupName('');
    setNameError('');
    setCreateOpen(true);
  }

  function openEdit(group: Group) {
    setEditGroup(group);
    setGroupName(group.name);
    setNameError('');
    setCreateOpen(true);
  }

  function openPermissions(group: Group) {
    setPermGroup(group);
    setPendingPerms([...group.permissions]);
    setPermModalOpen(true);
  }

  async function handleSaveGroup(e: React.FormEvent) {
    e.preventDefault();
    setNameError('');
    if (!groupName.trim()) {
      setNameError('Group name is required');
      return;
    }
    setActionLoading(true);
    try {
      if (editGroup) {
        await updateGroup(editGroup.id, groupName.trim());
        toast('Group updated', 'success');
      } else {
        await createGroup(groupName.trim());
        toast('Group created', 'success');
      }
      setCreateOpen(false);
      await load();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to save group';
      setNameError(msg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(group: Group) {
    if (!confirm(`Delete group "${group.name}"? Members will lose any group-level permissions.`))
      return;
    setActionLoading(true);
    try {
      await deleteGroup(group.id);
      toast('Group deleted', 'success');
      await load();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to delete group';
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSavePermissions(e: React.FormEvent) {
    e.preventDefault();
    if (!permGroup) return;
    setActionLoading(true);
    try {
      await setGroupPermissions(permGroup.id, pendingPerms);
      toast('Group permissions updated', 'success');
      setPermModalOpen(false);
      await load();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to update permissions';
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  function togglePermission(perm: Permission, grant: boolean) {
    setPendingPerms((prev) => {
      const existing = prev.find((p) => p.permission === perm);
      if (!existing) {
        return [...prev, { permission: perm, granted: grant }];
      }
      if (existing.granted === grant) {
        return prev.filter((p) => p.permission !== perm);
      }
      return prev.map((p) => (p.permission === perm ? { ...p, granted: grant } : p));
    });
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={openCreate}>Create group</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div
            className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"
            aria-hidden
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                {['Name', 'Members', 'Permission overrides', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {groups.map((row) => {
                const grants = row.permissions.filter((p) => p.granted).length;
                const denies = row.permissions.filter((p) => !p.granted).length;
                return (
                  <tr
                    key={row.id}
                    className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {row.name}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {row.members.length}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {grants === 0 && denies === 0 ? (
                        <span className="text-slate-400 dark:text-slate-500">None</span>
                      ) : (
                        <span>
                          {grants > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{grants} grant{grants !== 1 ? 's' : ''}
                            </span>
                          )}
                          {grants > 0 && denies > 0 && ', '}
                          {denies > 0 && (
                            <span className="text-red-600 dark:text-red-400">
                              -{denies} deny{denies !== 1 ? 's' : ''}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openPermissions(row)}
                          disabled={actionLoading}
                        >
                          Permissions
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openEdit(row)}
                          disabled={actionLoading}
                        >
                          Rename
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(row)}
                          disabled={actionLoading}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/edit group modal */}
      <Dialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setNameError('');
        }}
        title={editGroup ? 'Rename group' : 'Create group'}
      >
        <form onSubmit={handleSaveGroup} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="group-name"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Group name
            </label>
            <input
              id="group-name"
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. No-Invite"
              autoFocus
              className={cn(
                'w-full rounded-xl border px-3 py-2 text-sm',
                'border-slate-200 dark:border-slate-600',
                'bg-white dark:bg-slate-800',
                'text-slate-900 dark:text-slate-100',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                nameError && 'border-red-400 dark:border-red-600',
              )}
            />
            {nameError && <p className="text-xs text-red-600 dark:text-red-400">{nameError}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button type="submit" loading={actionLoading}>
              {editGroup ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Permissions modal */}
      <Dialog
        open={permModalOpen}
        onClose={() => setPermModalOpen(false)}
        title={`Permissions — ${permGroup?.name ?? ''}`}
      >
        <form onSubmit={handleSavePermissions}>
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Grant or deny permissions for all members of this group. Leave unchecked to use role
              defaults.
            </p>
            {ALL_PERMISSIONS.map((perm) => {
              const override = pendingPerms.find((p) => p.permission === perm);
              const isGranted = override?.granted === true;
              const isDenied = override?.granted === false;
              return (
                <Card key={perm}>
                  <CardContent className="py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex-1 text-sm font-mono text-slate-800 dark:text-slate-200">
                        {perm}
                      </span>
                      <label className="flex items-center gap-1 cursor-pointer text-sm text-emerald-600 dark:text-emerald-400">
                        <input
                          type="checkbox"
                          checked={isGranted}
                          onChange={(e) => {
                            if (e.target.checked) {
                              togglePermission(perm, true);
                            } else {
                              setPendingPerms((prev) =>
                                prev.filter((p) => p.permission !== perm || p.granted !== true),
                              );
                            }
                          }}
                        />
                        Grant
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer text-sm text-red-600 dark:text-red-400">
                        <input
                          type="checkbox"
                          checked={isDenied}
                          onChange={(e) => {
                            if (e.target.checked) {
                              togglePermission(perm, false);
                            } else {
                              setPendingPerms((prev) =>
                                prev.filter((p) => p.permission !== perm || p.granted !== false),
                              );
                            }
                          }}
                        />
                        Deny
                      </label>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="flex gap-2 justify-end pt-4 mt-2 border-t border-slate-200 dark:border-slate-700">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPermModalOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button type="submit" loading={actionLoading}>
              Save permissions
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
