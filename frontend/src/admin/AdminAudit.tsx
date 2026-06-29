import React, { useEffect, useState, useCallback } from 'react';
import { getAuditLog, AuditEntry } from '../api/admin';
import { useToast } from '../components/ui/Toast';
import { ApiClientError } from '../api/client';

export function AdminAudit() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAuditLog(100);
      setEntries(data);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load audit log';
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
        Most recent 100 audit entries.
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
                {['Time', 'Actor', 'Action', 'Target', 'Details'].map((h) => (
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
              {entries.map((row) => (
                <tr
                  key={row.id}
                  className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {row.actor?.nickname ?? row.actorUserId ?? '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-800 dark:text-slate-200">
                    {row.action}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {row.targetType && row.targetId
                      ? `${row.targetType}/${row.targetId.slice(0, 8)}…`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {row.metadata
                      ? `${JSON.stringify(row.metadata).slice(0, 60)}${JSON.stringify(row.metadata).length > 60 ? '…' : ''}`
                      : '—'}
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
