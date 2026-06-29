import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { cn } from '../components/ui/utils';
import { useToast } from '../components/ui/Toast';
import { ApiClientError } from '../api/client';
import { listGames, listModules, deleteGame, GameSummary, ModuleInfo } from '../api/play';
import { useAuth } from '../auth/AuthContext';

type FilterTab = 'all' | 'active' | 'completed' | 'abandoned';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function HistoryPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [deleteTarget, setDeleteTarget] = useState<GameSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, mods] = await Promise.all([
        listGames(),
        listModules().catch(() => [] as ModuleInfo[]),
      ]);
      setModules(mods);
      setGames(
        data.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
      );
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load history';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteGame(deleteTarget.id);
      setGames((prev) => prev.filter((g) => g.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to delete game';
      toast(msg, 'error');
    } finally {
      setDeleting(false);
    }
  }

  const filtered = games.filter((g) => {
    if (filter === 'active') return g.status === 'ACTIVE';
    if (filter === 'completed') return g.status === 'COMPLETE';
    if (filter === 'abandoned') return g.status === 'ABANDONED';
    return true;
  });

  const moduleNameMap = Object.fromEntries(modules.map((m) => [m.id, m.name]));

  const totalPlayed = games.length;
  const activeCount = games.filter((g) => g.status === 'ACTIVE').length;
  const completedCount = games.filter((g) => g.status === 'COMPLETE').length;
  const abandonedCount = games.filter((g) => g.status === 'ABANDONED').length;

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center items-center py-16">
          <span
            className="inline-block w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"
            role="status"
            aria-label="Loading"
          />
        </div>
      </AppShell>
    );
  }

  return (
    <>
      <AppShell>
        <main className="max-w-2xl mx-auto px-4 sm:px-6 pb-16 pt-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">
            Game History
          </h1>

          {/* Stats */}
          <div className="history-stats flex gap-4 flex-wrap mb-5">
            {(
              [
                ['history-stats__value', totalPlayed, 'Games played'],
                ['history-stats__value', activeCount, 'Active'],
                ['history-stats__value', completedCount, 'Completed'],
              ] as const
            ).map(([, value, label]) => (
              <div
                key={label}
                className={cn(
                  'history-stats__item',
                  'flex flex-col items-center flex-1 min-w-[80px] px-6 py-3 rounded-lg',
                  'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700',
                )}
              >
                <span className="history-stats__value text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {value}
                </span>
                <span className="history-stats__label text-sm text-slate-500 dark:text-slate-400">
                  {label}
                </span>
              </div>
            ))}
            {abandonedCount > 0 && (
              <div
                className={cn(
                  'history-stats__item',
                  'flex flex-col items-center flex-1 min-w-[80px] px-6 py-3 rounded-lg',
                  'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700',
                )}
              >
                <span className="history-stats__value text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {abandonedCount}
                </span>
                <span className="history-stats__label text-sm text-slate-500 dark:text-slate-400">
                  Abandoned
                </span>
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div className="filter-tabs flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
            {(['all', 'active', 'completed', 'abandoned'] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                className={cn(
                  'filter-tabs__tab',
                  'rounded-lg text-sm font-medium min-h-9 px-3 py-1 transition-colors duration-150',
                  filter === tab
                    ? 'filter-tabs__tab--active bg-indigo-600 text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/40 hover:text-slate-900 dark:hover:text-slate-100',
                )}
                onClick={() => setFilter(tab)}
                type="button"
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Game list */}
          {filtered.length === 0 ? (
            <Card className="p-8">
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <History size={40} className="text-slate-300 dark:text-slate-600" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {filter === 'all' ? 'No games yet' : `No ${filter} games`}
                </h3>
                {filter === 'all' && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Start your first game to see your history here.
                  </p>
                )}
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((g) => {
                const isAbandoned = g.status === 'ABANDONED';
                const href =
                  g.status === 'COMPLETE'
                    ? `/play/${g.id}/results`
                    : isAbandoned
                      ? null
                      : `/play/${g.id}`;
                const players = g.participations.map((p) => p.player.nickname).join(', ');
                const statusLabel =
                  g.status === 'ACTIVE'
                    ? 'Active'
                    : g.status === 'COMPLETE'
                      ? 'Complete'
                      : 'Abandoned';
                const statusClass =
                  g.status === 'ACTIVE'
                    ? 'status-badge--active bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-500'
                    : g.status === 'COMPLETE'
                      ? 'status-badge--complete bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      : 'status-badge--abandoned bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 line-through';
                const isCreator = user?.id === g.createdById;

                const cardContent = (
                  <Card className="p-4 history-card transition-colors duration-150 hover:border-indigo-400 dark:hover:border-indigo-500">
                    <div className="history-card__row flex items-center justify-between gap-3">
                      <div className="history-card__info flex flex-col gap-1 flex-1">
                        <span className="history-card__module text-base font-medium text-slate-900 dark:text-slate-100">
                          {moduleNameMap[g.moduleKey] ?? g.moduleKey}
                        </span>
                        <span className="history-card__players text-sm text-slate-500 dark:text-slate-400">
                          {players}
                        </span>
                        <span className="history-card__date text-sm text-slate-500 dark:text-slate-400">
                          {formatDate(g.startedAt)}
                        </span>
                      </div>
                      <div className="history-card__status flex items-center gap-2 flex-shrink-0">
                        <span
                          className={cn(
                            'status-badge rounded text-sm font-medium px-2 py-1',
                            statusClass,
                          )}
                        >
                          {statusLabel}
                        </span>
                        {isCreator && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDeleteTarget(g);
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );

                if (href) {
                  return (
                    <Link key={g.id} to={href} className="no-underline text-inherit block">
                      {cardContent}
                    </Link>
                  );
                }
                return <div key={g.id}>{cardContent}</div>;
              })}
            </div>
          )}
        </main>
      </AppShell>

      {/* Delete confirmation modal */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete this game?"
      >
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Delete this game permanently? This can&apos;t be undone. All scores and events will be
          removed.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Keep game
          </Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>
            Delete game
          </Button>
        </div>
      </Dialog>
    </>
  );
}
