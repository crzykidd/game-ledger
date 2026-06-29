import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { cn } from '../../components/ui/utils';
import type { CaptureProps } from './index';

/**
 * Derive the dealer seat index for the given deal number.
 *
 * Dealer of deal D (1-based) = participant at seat index ((D-1) mod playerCount).
 * Seat 0 deals deal 1, seat 1 deals deal 2, … wrapping around.
 * Crib owner = dealer.
 */
export function getDealerIndex(deal: number, playerCount: number): number {
  if (playerCount === 0) return 0;
  return (deal - 1) % playerCount;
}

/**
 * CribbageCapture — live-pegging score entry panel for Cribbage.
 *
 * Live model: every +1/+2/+3 tap and add-field submit immediately posts a
 * round_score event (via addScore) and moves the board peg. Undo walks back
 * peg-by-peg (via onUndoLast). "End Deal" posts an empty-scores marker that
 * increments the deal counter and rotates the crib (via endDeal). The game ends
 * the moment a player crosses the target — a win banner appears in GamePage and
 * all scoring controls are disabled here.
 *
 * No local score buffer. The per-player total is read directly from ScoreState
 * returned by the backend after each event post. The only local state is the
 * "add" text-input value (transient, not persisted).
 */
export function CribbageCapture({
  participations,
  currentDeal,
  saving,
  target,
  addScore,
  endDeal,
  onUndoLast,
}: CaptureProps) {
  // Transient input field values (not persisted — just the typed text before submit).
  const [addValues, setAddValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(participations.map((p) => [p.id, ''])),
  );

  const dealerIndex = getDealerIndex(currentDeal, participations.length);
  const dealer = participations[dealerIndex];

  // Win detected: any player has reached or exceeded the target.
  const hasWinner =
    target > 0 &&
    participations.some((p) => (p.scoreState?.payload?.totals?.[p.id] ?? 0) >= target);

  // All scoring actions are disabled while saving (in-flight) or game is won.
  const blocked = saving || hasWinner;

  async function handleAddSubmit(participationId: string) {
    const raw = addValues[participationId] ?? '';
    const val = parseInt(raw, 10);
    if (!isNaN(val) && val !== 0) {
      setAddValues((prev) => ({ ...prev, [participationId]: '' }));
      await addScore(participationId, val);
    } else {
      setAddValues((prev) => ({ ...prev, [participationId]: '' }));
    }
  }

  return (
    <div className="cribbage-capture flex flex-col gap-4">
      {/* Dealer / crib label */}
      <div
        className="cribbage-capture__crib-label text-sm font-semibold text-indigo-600 dark:text-indigo-400"
        data-testid="crib-label"
      >
        {dealer?.player.nickname}&apos;s crib — Deal {currentDeal}
      </div>

      {/* Per-player panels */}
      {participations.map((p, i) => {
        const isDealer = i === dealerIndex;
        const liveTotal = p.scoreState?.payload?.totals?.[p.id] ?? 0;
        const addVal = addValues[p.id] ?? '';
        const addParsed = parseInt(addVal, 10);
        const addValid = addVal !== '' && !isNaN(addParsed) && addParsed !== 0;

        return (
          <div
            key={p.id}
            className={cn(
              'cribbage-player-panel',
              'rounded-xl border-2 p-4 flex flex-col gap-3 transition-colors duration-150',
              isDealer
                ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60',
            )}
            data-testid={`capture-player-${p.id}`}
          >
            {/* Header: player name + dealer/crib badges + live total */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {p.player.nickname}
                </span>
                {isDealer && (
                  <>
                    <Badge variant="default" data-testid={`dealer-chip-${p.id}`}>
                      Dealer
                    </Badge>
                    <Badge variant="warning">Crib</Badge>
                  </>
                )}
              </div>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Total:{' '}
                <span
                  className="text-xl font-bold text-slate-900 dark:text-slate-100"
                  data-testid={`live-total-${p.id}`}
                >
                  {liveTotal}
                </span>
              </span>
            </div>

            {/* Pegging quick-add buttons + numeric add field */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* +1 quick button */}
              <button
                type="button"
                className={cn(
                  'flex items-center justify-center min-h-11 min-w-[3rem] rounded-lg border text-base font-bold px-3',
                  'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100',
                  'hover:bg-indigo-600 hover:border-indigo-600 hover:text-white active:scale-95 transition-all duration-100',
                  'disabled:opacity-35 disabled:cursor-not-allowed',
                )}
                onClick={() => void addScore(p.id, 1)}
                disabled={blocked}
                aria-label={`+1 for ${p.player.nickname}`}
                data-testid={`btn-plus1-${p.id}`}
              >
                +1
              </button>

              {/* +2 quick button */}
              <button
                type="button"
                className={cn(
                  'flex items-center justify-center min-h-11 min-w-[3rem] rounded-lg border text-base font-bold px-3',
                  'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100',
                  'hover:bg-indigo-600 hover:border-indigo-600 hover:text-white active:scale-95 transition-all duration-100',
                  'disabled:opacity-35 disabled:cursor-not-allowed',
                )}
                onClick={() => void addScore(p.id, 2)}
                disabled={blocked}
                aria-label={`+2 for ${p.player.nickname}`}
                data-testid={`btn-plus2-${p.id}`}
              >
                +2
              </button>

              {/* +3 quick button */}
              <button
                type="button"
                className={cn(
                  'flex items-center justify-center min-h-11 min-w-[3rem] rounded-lg border text-base font-bold px-3',
                  'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100',
                  'hover:bg-indigo-600 hover:border-indigo-600 hover:text-white active:scale-95 transition-all duration-100',
                  'disabled:opacity-35 disabled:cursor-not-allowed',
                )}
                onClick={() => void addScore(p.id, 3)}
                disabled={blocked}
                aria-label={`+3 for ${p.player.nickname}`}
                data-testid={`btn-plus3-${p.id}`}
              >
                +3
              </button>

              {/* Numeric add field (runs, show counts, crib) — type="text" +
                  inputMode="numeric" so mobile shows the numeric keypad without
                  native spin arrows (absent on mobile, tiny on desktop). */}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={cn(
                    'w-16 text-center text-sm font-medium min-h-11 px-2 py-2 rounded-lg border-2',
                    'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
                    'text-slate-900 dark:text-slate-100',
                    'focus:outline-none focus:border-indigo-600 transition-colors duration-150',
                    'disabled:opacity-35 disabled:cursor-not-allowed',
                  )}
                  value={addVal}
                  onChange={(e) =>
                    setAddValues((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAddSubmit(p.id);
                    }
                  }}
                  disabled={blocked}
                  placeholder="+"
                  aria-label={`Add points for ${p.player.nickname}`}
                  data-testid={`add-input-${p.id}`}
                />
                <button
                  type="button"
                  className={cn(
                    'flex items-center justify-center min-h-11 px-3 rounded-lg border text-sm font-medium',
                    'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
                    'hover:bg-indigo-600 hover:border-indigo-600 hover:text-white active:scale-95 transition-all duration-100',
                    'disabled:opacity-35 disabled:cursor-not-allowed',
                  )}
                  onClick={() => void handleAddSubmit(p.id)}
                  disabled={blocked || !addValid}
                  aria-label={`Add custom points for ${p.player.nickname}`}
                  data-testid={`add-btn-${p.id}`}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Global undo — pops the last peg (or End Deal marker) server-side */}
      <button
        type="button"
        className={cn(
          'flex items-center justify-center min-h-11 px-3 rounded-lg border text-sm font-medium',
          'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400',
          'hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100 active:scale-95 transition-all duration-100',
          'disabled:opacity-35 disabled:cursor-not-allowed',
        )}
        onClick={() => void onUndoLast()}
        disabled={saving}
        aria-label="Undo last peg"
        data-testid="undo-last-btn"
      >
        ↶ Undo last peg
      </button>

      {/* End Deal — posts empty-scores marker; rotates crib to next player */}
      <Button
        type="button"
        size="lg"
        variant="primary"
        loading={saving}
        disabled={blocked}
        onClick={() => void endDeal()}
        className="w-full"
        data-testid="end-deal-btn"
      >
        End Deal
      </Button>
    </div>
  );
}
