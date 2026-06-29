import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cn } from '../components/ui/utils';
import { ApiClientError } from '../api/client';
import { useToast } from '../components/ui/Toast';
import {
  listPlayers,
  listPlaygroups,
  listModules,
  createGame,
  Player,
  Playgroup,
  ModuleInfo,
} from '../api/play';

const selectClass = cn(
  'form-field__input',
  'w-full min-h-[44px] px-3 py-2 rounded-lg border-2 appearance-none text-base',
  'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
  'text-slate-900 dark:text-slate-100',
  'focus:outline-none focus:border-indigo-600 transition-colors duration-150',
);

export function StartGamePage() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [players, setPlayers] = useState<Player[]>([]);
  const [playgroups, setPlaygroups] = useState<Playgroup[]>([]);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const [moduleKey, setModuleKey] = useState('');
  const [seatCount, setSeatCount] = useState<number | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedPlaygroupId, setSelectedPlaygroupId] = useState('');
  const [showPreRelease, setShowPreRelease] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gl-show-pre-release') === 'true';
    } catch {
      return false;
    }
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, pgs, mods] = await Promise.all([
        listPlayers(),
        listPlaygroups(),
        listModules().catch(() => [] as ModuleInfo[]),
      ]);
      setPlayers(ps);
      setPlaygroups(pgs);
      setModules(mods);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load data';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedModule = modules.find((m) => m.id === moduleKey) ?? null;

  const sortedModules = [...modules].sort(
    (a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) || a.name.localeCompare(b.name),
  );

  const isReleased = (m: ModuleInfo) => m.maturity === 'released';
  const visibleModules = sortedModules.filter((m) => showPreRelease || isReleased(m));

  function handleTogglePreRelease() {
    setShowPreRelease((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('gl-show-pre-release', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function handleModuleChange(newKey: string) {
    setModuleKey(newKey);
    setSeatCount(null);
    setSlots([]);
    setSelectedPlaygroupId('');
  }

  function handleSeatCount(n: number) {
    setSeatCount(n);
    setSlots((prev) => {
      const next = [...prev];
      while (next.length < n) next.push('');
      return next.slice(0, n);
    });
  }

  function handlePlaygroupChange(pgId: string) {
    setSelectedPlaygroupId(pgId);
    if (!pgId) {
      setSlots((prev) => prev.map(() => ''));
      return;
    }
    const pg = playgroups.find((p) => p.id === pgId);
    if (!pg || !selectedModule) return;
    const { min, max } = selectedModule.players;
    const clampedCount = Math.max(min, Math.min(max, pg.members.length));
    setSeatCount(clampedCount);
    const memberIds = pg.members.slice(0, clampedCount).map((m) => m.player.id);
    const newSlots = Array.from({ length: clampedCount }, (_, i) => memberIds[i] ?? '');
    setSlots(newSlots);
  }

  function handleSlotChange(slotIndex: number, playerId: string) {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = playerId;
      return next;
    });
  }

  function slotOptions(slotIndex: number): Player[] {
    const takenIds = new Set(slots.filter((id, i) => i !== slotIndex && id !== ''));
    return players.filter((p) => !takenIds.has(p.id));
  }

  const allSlotsFilled =
    seatCount !== null && slots.length === seatCount && slots.every((id) => id !== '');
  const canStart = !!selectedModule && seatCount !== null && allSlotsFilled;

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedModule) {
      toast('Select a game', 'error');
      return;
    }
    if (seatCount === null) {
      toast('Choose a player count', 'error');
      return;
    }
    if (!allSlotsFilled) {
      toast('Fill all player slots', 'error');
      return;
    }
    setStarting(true);
    try {
      const game = await createGame({
        moduleKey,
        playgroupId: selectedPlaygroupId || undefined,
        participantPlayerIds: slots,
      });
      navigate(`/play/${game.id}`);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to start game';
      toast(msg, 'error');
    } finally {
      setStarting(false);
    }
  }

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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">
          Start New Game
        </h1>

        <form onSubmit={handleStart} className="flex flex-col gap-4">
          <Card className="p-6">
            {/* Game dropdown */}
            <div className="mb-6">
              <label
                htmlFor="game-select"
                className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2"
              >
                Game
              </label>
              <select
                id="game-select"
                className={selectClass}
                value={moduleKey}
                onChange={(e) => handleModuleChange(e.target.value)}
              >
                <option value="">— Select a game —</option>
                {visibleModules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.players.min}–{m.players.max})
                    {m.maturity !== 'released' ? ' · Pre-release' : ''}
                  </option>
                ))}
              </select>
              {visibleModules.length === 0 && !showPreRelease && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  No released games yet — turn on <em>Show pre-release games</em> to see games in
                  development.
                </p>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 mt-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="show-pre-release"
                  checked={showPreRelease}
                  onChange={handleTogglePreRelease}
                  className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-600"
                />
                Show pre-release games
              </label>
            </div>

            {/* Playgroup selector — shown once a game is selected */}
            {selectedModule && playgroups.length > 0 && (
              <div className="mb-6">
                <label
                  htmlFor="playgroup-select"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2"
                >
                  Playgroup (optional)
                </label>
                <select
                  id="playgroup-select"
                  className={selectClass}
                  value={selectedPlaygroupId}
                  onChange={(e) => handlePlaygroupChange(e.target.value)}
                >
                  <option value="">— No playgroup —</option>
                  {playgroups.map((pg) => (
                    <option key={pg.id} value={pg.id}>
                      {pg.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Player-count buttons — shown once a game is selected */}
            {selectedModule && (
              <div className="mb-6">
                <p className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Number of players
                </p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(
                    { length: selectedModule.players.max - selectedModule.players.min + 1 },
                    (_, i) => selectedModule.players.min + i,
                  ).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleSeatCount(n)}
                      aria-pressed={seatCount === n}
                      className={cn(
                        'min-h-[40px] min-w-[40px] px-3 rounded-lg border-2 text-sm font-medium transition-colors duration-150',
                        seatCount === n
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:border-indigo-600',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Player-slot grid — shown once a count is chosen */}
            {seatCount !== null && slots.length === seatCount && (
              <div>
                <p className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Players
                </p>
                {players.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No players available.{' '}
                    <a
                      href="/players"
                      className="text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Add players
                    </a>{' '}
                    first.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {slots.map((slotValue, idx) => (
                      <div key={idx}>
                        <label
                          htmlFor={`slot-${idx}`}
                          className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
                        >
                          Seat {idx + 1}
                        </label>
                        <select
                          id={`slot-${idx}`}
                          className={selectClass}
                          value={slotValue}
                          onChange={(e) => handleSlotChange(idx, e.target.value)}
                        >
                          <option value="">— Choose player —</option>
                          {slotOptions(idx).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nickname}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Button
            type="submit"
            size="lg"
            variant="primary"
            loading={starting}
            disabled={!canStart}
            className="w-full"
          >
            <Gamepad2 size={18} />
            Start game
          </Button>
        </form>
      </main>
    </AppShell>
  );
}
