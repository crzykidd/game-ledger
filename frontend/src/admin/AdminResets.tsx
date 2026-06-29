import React, { useEffect, useState, useCallback } from 'react';
import { listResets, ResetListItem } from '../api/admin';
import { cn } from '../components/ui/utils';
import { useToast } from '../components/ui/Toast';
import { ApiClientError } from '../api/client';

type ResetStatus = 'pending' | 'claimed' | 'expired' | 'revoked';

function statusClass(status: ResetStatus): string {
  switch (status) {
    case 'pending':
      return 'text-indigo-600 dark:text-indigo-400';
    case 'claimed':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'expired':
      return 'text-slate-500 dark:text-slate-400';
    case 'revoked':
      return 'text-red-600 dark:text-red-400';
  }
}

export function AdminResets() {
  const { toast } = useToast();
  const [resets, setResets] = useState<ResetListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listResets();
      setResets(data);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load resets';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Generate reset links from a user&apos;s detail page. This list shows all issued reset links
        and their claimed status.
      </p>

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
                {['User', 'Status', 'Issued by', 'Issued', 'Expires', 'Claimed at'].map((h) => (
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
              {resets.map((row) => (
                <tr
                  key={row.id}
                  className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                    {row.target?.nickname ?? '—'}
                  </td>
                  <td className={cn('px-4 py-3 font-medium', statusClass(row.status))}>
                    {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {row.createdBy?.nickname ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {new Date(row.expiresAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {row.consumedAt ? new Date(row.consumedAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
