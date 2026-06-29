import React, { useEffect, useState, useCallback } from 'react';
import {
  listInvites,
  createInvite,
  revokeInvite,
  regenerateInvite,
  InviteListItem,
  CreateInviteResult,
} from '../api/admin';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Card, CardContent } from '../components/ui/Card';
import { cn } from '../components/ui/utils';
import { useToast } from '../components/ui/Toast';
import { ApiClientError } from '../api/client';
import { CopyLink } from './CopyLink';

type InviteStatus = 'pending' | 'claimed' | 'expired' | 'revoked';

function statusClass(status: InviteStatus): string {
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

export function AdminInvites() {
  const { toast } = useToast();
  const [invites, setInvites] = useState<InviteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [createError, setCreateError] = useState('');

  const [linkResult, setLinkResult] = useState<CreateInviteResult | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listInvites();
      setInvites(data);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load invites';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    if (!newEmail.trim()) {
      setCreateError('Email is required');
      return;
    }
    setActionLoading(true);
    try {
      const result = await createInvite({ email: newEmail.trim() });
      setLinkResult(result);
      setCreateOpen(false);
      setNewEmail('');
      setLinkModalOpen(true);
      await load();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to create invite';
      setCreateError(msg);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this invite?')) return;
    setActionLoading(true);
    try {
      await revokeInvite(id);
      toast('Invite revoked', 'success');
      await load();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to revoke invite';
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRegenerate(id: string) {
    if (!confirm('Regenerate this invite? The old link will be invalidated.')) return;
    setActionLoading(true);
    try {
      const result = await regenerateInvite(id);
      setLinkResult(result);
      setLinkModalOpen(true);
      await load();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to regenerate invite';
      toast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setCreateOpen(true)}>Create invite</Button>
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
                {['Email', 'Status', 'Claimed by', 'Sent by', 'Expires', ''].map((h) => (
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
              {invites.map((row) => {
                const canRevoke = row.status === 'pending';
                const canRegenerate = row.status !== 'claimed';
                return (
                  <tr
                    key={row.id}
                    className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                      {row.email ?? '—'}
                    </td>
                    <td className={cn('px-4 py-3 font-medium', statusClass(row.status))}>
                      {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {row.claimedByUser?.nickname ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {row.createdBy?.nickname ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {new Date(row.expiresAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {canRevoke && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleRevoke(row.id)}
                            disabled={actionLoading}
                          >
                            Revoke
                          </Button>
                        )}
                        {canRegenerate && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleRegenerate(row.id)}
                            disabled={actionLoading}
                          >
                            Regenerate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create invite modal */}
      <Dialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateError('');
          setNewEmail('');
        }}
        title="Create invite"
      >
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="invite-email"
              className="text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Email address
            </label>
            <input
              id="invite-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="friend@example.com"
              autoFocus
              className={cn(
                'w-full rounded-xl border px-3 py-2 text-sm',
                'border-slate-200 dark:border-slate-600',
                'bg-white dark:bg-slate-800',
                'text-slate-900 dark:text-slate-100',
                'placeholder:text-slate-400 dark:placeholder:text-slate-500',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                createError && 'border-red-400 dark:border-red-600',
              )}
            />
            {createError && <p className="text-xs text-red-600 dark:text-red-400">{createError}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                setCreateError('');
                setNewEmail('');
              }}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button type="submit" loading={actionLoading}>
              Create &amp; get link
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Copy-link modal */}
      <Dialog
        open={linkModalOpen}
        onClose={() => {
          setLinkModalOpen(false);
          setLinkResult(null);
        }}
        title="Invite link"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Share this invite link. It expires{' '}
            <strong>{linkResult ? new Date(linkResult.expiresAt).toLocaleString() : ''}</strong> and
            is single-use.
          </p>
          {linkResult && <CopyLink link={linkResult.link} label="Copy invite link" />}
          <Card>
            <CardContent className="py-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                For:{' '}
                <strong className="text-slate-700 dark:text-slate-200">{linkResult?.email}</strong>
              </p>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setLinkModalOpen(false);
                setLinkResult(null);
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
