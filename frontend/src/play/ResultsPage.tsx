import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { cn } from '../components/ui/utils';
import { ApiClientError } from '../api/client';
import { getGame, listModules, FinishResult, Participation, ModuleInfo } from '../api/play';

interface RankRow {
  participationId: string;
  nickname: string;
  rank: number | null;
  score: number | null;
  didWin: boolean;
}

function buildRanksFromFinishResult(
  result: FinishResult,
  participations: Participation[],
): RankRow[] {
  return result.resolved.ranks
    .map((r) => {
      const participation = participations.find((p) => p.id === r.participationId);
      return {
        participationId: r.participationId,
        nickname: participation?.player.nickname ?? r.participationId,
        rank: r.rank,
        score: r.score,
        didWin: r.didWin,
      };
    })
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
}

function buildRanksFromGameDetail(
  participations: Participation[],
  direction: 'low' | 'high' = 'low',
  resultType?: string,
): RankRow[] {
  // rank_order games: use finishOrder from scoreState if present
  const anyFinishOrder = participations.find((p) => p.scoreState?.payload?.finishOrder);
  if (resultType === 'ranking' || anyFinishOrder) {
    const finishOrder = anyFinishOrder?.scoreState?.payload?.finishOrder ?? [];
    const orderMap = new Map(finishOrder.map((o) => [o.participationId, o.rank]));
    return participations
      .map((p) => ({
        participationId: p.id,
        nickname: p.player.nickname,
        rank: orderMap.get(p.id) ?? 999,
        score: null,
        didWin: orderMap.get(p.id) === 1,
      }))
      .sort((a, b) => a.rank - b.rank);
  }

  // Numeric games: totals come from scoreState
  const withTotals = participations.map((p) => ({
    id: p.id,
    nickname: p.player.nickname,
    total: p.scoreState?.payload?.totals?.[p.id] ?? 0,
  }));

  withTotals.sort((a, b) => (direction === 'low' ? a.total - b.total : b.total - a.total));
  const leaderTotal = withTotals[0]?.total ?? 0;

  return withTotals.map((p, i) => ({
    participationId: p.id,
    nickname: p.nickname,
    rank: i + 1,
    score: p.total,
    didWin: p.total === leaderTotal,
  }));
}

export function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { toast } = useToast();

  const locationState = location.state as { result?: FinishResult } | null;
  const finishResult = locationState?.result;

  const [ranks, setRanks] = useState<RankRow[]>([]);
  const [loading, setLoading] = useState(!finishResult);
  const [winnerName, setWinnerName] = useState('');
  const [moduleInfo, setModuleInfo] = useState<ModuleInfo | null>(null);

  const isRankOnly = moduleInfo?.result?.type === 'ranking' && ranks.every((r) => r.score === null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [game, mods] = await Promise.all([
        getGame(id),
        listModules().catch(() => [] as ModuleInfo[]),
      ]);
      const mod = mods.find((m) => m.id === game.moduleKey) ?? null;
      setModuleInfo(mod);
      const direction = (mod?.scoringType?.config?.direction as 'low' | 'high') ?? 'low';
      const rows = buildRanksFromGameDetail(
        [...game.participations].sort((a, b) => a.seat - b.seat),
        direction,
        mod?.result?.type,
      );
      setRanks(rows);
      const winner = rows.find((r) => r.didWin);
      setWinnerName(winner?.nickname ?? '');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load results';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    if (finishResult) {
      const fetchNicknames = async () => {
        if (!id) return;
        try {
          const [game, mods] = await Promise.all([
            getGame(id),
            listModules().catch(() => [] as ModuleInfo[]),
          ]);
          const mod = mods.find((m) => m.id === game.moduleKey) ?? null;
          setModuleInfo(mod);
          const rows = buildRanksFromFinishResult(finishResult, game.participations);
          setRanks(rows);
          const winner = rows.find((r) => r.didWin);
          setWinnerName(winner?.nickname ?? '');
        } catch {
          const rows = finishResult.resolved.ranks
            .map((r) => ({
              participationId: r.participationId,
              nickname: r.participationId,
              rank: r.rank,
              score: r.score,
              didWin: r.didWin,
            }))
            .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
          setRanks(rows);
          const winner = rows.find((r) => r.didWin);
          setWinnerName(winner?.nickname ?? '');
        } finally {
          setLoading(false);
        }
      };
      fetchNicknames();
    } else {
      load();
    }
  }, [finishResult, load, id]);

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
    <AppShell>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 pb-16 pt-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Game Over</h1>
          {winnerName && (
            <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
              {winnerName} wins!
            </p>
          )}
          {moduleInfo && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {moduleInfo.result?.type === 'ranking'
                ? 'Ranked by finish order'
                : moduleInfo.scoringType?.config?.direction === 'high'
                  ? 'High score wins'
                  : 'Low score wins'}
            </p>
          )}
        </div>

        <Card className="p-6 mb-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Final Rankings
          </h2>
          {ranks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Trophy size={40} className="text-slate-300 dark:text-slate-600" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                No results yet
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Results will appear here once the game is finished.
              </p>
            </div>
          ) : (
            <div className="results-table flex flex-col">
              <div className="results-table__header grid grid-cols-[60px_1fr_80px_40px] gap-2 px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <span>Rank</span>
                <span>Player</span>
                {!isRankOnly && <span style={{ textAlign: 'right' }}>Score</span>}
                <span></span>
              </div>
              {ranks.map((r) => (
                <div
                  key={r.participationId}
                  className={cn(
                    'results-table__row grid grid-cols-[60px_1fr_80px_40px] gap-2 items-center p-3 min-h-[52px] border-b border-slate-200 dark:border-slate-700',
                    r.didWin &&
                      'results-table__row--winner bg-white dark:bg-slate-800/60 font-medium',
                  )}
                >
                  <span className="results-table__rank text-base font-bold text-slate-500 dark:text-slate-400">
                    #{r.rank ?? '—'}
                  </span>
                  <span className="results-table__name text-base text-slate-900 dark:text-slate-100">
                    {r.nickname}
                  </span>
                  {!isRankOnly && (
                    <span
                      className="results-table__score text-base font-medium text-slate-900 dark:text-slate-100"
                      style={{ textAlign: 'right' }}
                    >
                      {r.score ?? '—'}
                    </span>
                  )}
                  <span>
                    {r.didWin && (
                      <span className="results-table__win-badge text-lg" aria-label="Winner">
                        🏆
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex gap-3 justify-center flex-wrap">
          <Link to="/play/new">
            <Button variant="primary">Play again</Button>
          </Link>
          <Link to="/">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
