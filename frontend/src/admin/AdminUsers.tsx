import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserState } from '@game-ledger/contract';
import { listUsers, UserListItem } from '../api/admin';
import { cn } from '../components/ui/utils';
import { useToast } from '../components/ui/Toast';
import { ApiClientError } from '../api/client';
import { roleLabel } from './tier';

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

function stateBadgeClass(state: UserState): string {
  switch (state) {
    case UserState.ACTIVE:
      return 'text-emerald-700 dark:text-emerald-300';
    case UserState.PENDING:
      return 'text-slate-500 dark:text-slate-400';
    case UserState.DISABLED:
      return 'text-red-600 dark:text-red-400';
  }
}

export function AdminUsers() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listUsers({ includeDisabled: showDisabled, search: search || undefined });
      setUsers(data);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load users';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [showDisabled, search, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label
            htmlFor="user-search"
            className="text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            Search users
          </label>
          <input
            id="user-search"
            type="text"
            placeholder="Nickname, name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'w-full rounded-xl border px-3 py-2 text-sm',
              'border-slate-200 dark:border-slate-600',
              'bg-white dark:bg-slate-800',
              'text-slate-900 dark:text-slate-100',
              'placeholder:text-slate-400 dark:placeholder:text-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            )}
          />
        </div>
        <label className="flex items-center gap-2 pb-1 cursor-pointer text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showDisabled}
            onChange={(e) => setShowDisabled(e.target.checked)}
            aria-label="Show disabled users"
            className="rounded"
          />
          Show disabled
        </label>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Nickname
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  State
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Groups
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {users.map((row) => (
                <tr
                  key={row.id}
                  className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/users/${row.id}`}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                    >
                      {row.nickname}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {roleLabel(row.role)}
                  </td>
                  <td className={cn('px-4 py-3 font-medium', stateBadgeClass(row.state))}>
                    {stateLabel(row.state)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {row.groups.map((g) => g.group.name).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        {users.length} user{users.length !== 1 ? 's' : ''}
        {showDisabled ? ' (including disabled)' : ''}
      </div>
    </div>
  );
}
