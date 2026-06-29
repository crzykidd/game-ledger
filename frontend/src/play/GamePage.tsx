import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Flag, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppShell } from '../components/AppShell';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { cn } from '../components/ui/utils';
import { useToast } from '../components/ui/Toast';
import { ApiClientError } from '../api/client';
import {
  getGame,
  listModules,
  postEvent,
  finishGame,
  cancelGame,
  deleteGame,
  undoLastRound,
  StaleVersionError,
  GameDetail,
  Participation,
  ModuleInfo,
} from '../api/play';
import { useAuth } from '../auth/AuthContext';
import { genClientEventId } from '../lib/clientId';
import { getBoardComponent } from './presentation';
import { getCaptureComponent } from './capture';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getCurrentRound(participations: Participation[], moduleInfo: ModuleInfo | null): number {
  let maxRound = 0;
  if (isWinnerPick(moduleInfo)) {
    // winner_pick stores rounds as winnerPickRounds
    for (const p of participations) {
      const rounds =
        (p.scoreState?.payload as { winnerPickRounds?: Array<{ round: number }> })
          ?.winnerPickRounds ?? [];
      for (const r of rounds) {
        if (r.round > maxRound) maxRound = r.round;
      }
    }
  } else {
    for (const p of participations) {
      const rounds = p.scoreState?.payload?.rounds ?? [];
      for (const r of rounds) {
        if (r.round > maxRound) maxRound = r.round;
      }
    }
  }
  return maxRound + 1;
}

/**
 * For live-pegging games (cribbage): count "End Deal" marker rounds, which are
 * round_score events with empty scores ({}).
 * Deal number = 1 + count of empty-score rounds in ScoreState.
 */
function getCribbageDeal(participations: Participation[]): number {
  // All participations share the same set of rounds (events apply to all).
  // Use the first participation that has rounds data.
  for (const p of participations) {
    const rounds = p.scoreState?.payload?.rounds ?? [];
    const emptyCount = rounds.filter((r) => Object.keys(r.scores ?? {}).length === 0).length;
    return 1 + emptyCount;
  }
  return 1;
}

function getTotals(participations: Participation[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of participations) {
    totals[p.id] = p.scoreState?.payload?.totals?.[p.id] ?? 0;
  }
  return totals;
}

/** Returns true when the module uses rank_order capture (finish-order, not numeric). */
function isRankOrder(moduleInfo: ModuleInfo | null): boolean {
  return moduleInfo?.scoringType?.id === 'rank_order';
}

/** Returns true when the module uses winner_pick capture (single winner per round). */
function isWinnerPick(moduleInfo: ModuleInfo | null): boolean {
  return moduleInfo?.scoringType?.id === 'winner_pick';
}

// ─── Finish-Order Entry (rank_order) ──────────────────────────────────────────

interface SortableFinishItemProps {
  id: string;
  position: number;
  nickname: string;
  totalCount: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function SortableFinishItem({
  id,
  position,
  nickname,
  totalCount,
  onMoveUp,
  onMoveDown,
}: SortableFinishItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'seat-item',
        'flex items-center gap-2 px-3 py-2 min-h-12 rounded-lg border-2 transition-shadow duration-150',
        'bg-slate-50 dark:bg-slate-700/40',
        isDragging
          ? 'seat-item--dragging border-indigo-600 shadow-lg z-10'
          : 'border-slate-200 dark:border-slate-700',
      )}
    >
      <span
        className="seat-item__handle flex items-center flex-shrink-0 p-1 text-slate-500 dark:text-slate-400 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${nickname}`}
      >
        <GripVertical size={18} />
      </span>
      <span className="seat-item__num min-w-[1.5rem] text-sm font-bold text-slate-500 dark:text-slate-400">
        {position}.
      </span>
      <span className="seat-item__name flex-1 text-base text-slate-900 dark:text-slate-100">
        {nickname}
      </span>
      <div className="seat-item__arrows flex gap-1 flex-shrink-0">
        <button
          type="button"
          className={cn(
            'seat-arrow-btn',
            'flex items-center justify-center min-h-9 min-w-9 px-2 rounded border text-base',
            'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100',
            'hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-100',
            'disabled:opacity-35 disabled:cursor-not-allowed',
          )}
          onClick={onMoveUp}
          disabled={position === 1}
          aria-label={`Move ${nickname} up`}
        >
          ↑
        </button>
        <button
          type="button"
          className={cn(
            'seat-arrow-btn',
            'flex items-center justify-center min-h-9 min-w-9 px-2 rounded border text-base',
            'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100',
            'hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors duration-100',
            'disabled:opacity-35 disabled:cursor-not-allowed',
          )}
          onClick={onMoveDown}
          disabled={position === totalCount}
          aria-label={`Move ${nickname} down`}
        >
          ↓
        </button>
      </div>
    </li>
  );
}

interface FinishOrderFormProps {
  participations: Participation[];
  saving: boolean;
  onSave: (order: Array<{ participationId: string; rank: number }>) => void;
}

function FinishOrderForm({ participations, saving, onSave }: FinishOrderFormProps) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() => participations.map((p) => p.id));

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedIds((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  function moveItem(index: number, direction: 'up' | 'down') {
    setOrderedIds((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const order = orderedIds.map((id, idx) => ({
      participationId: id,
      rank: idx + 1,
    }));
    onSave(order);
  }

  const nicknames = Object.fromEntries(participations.map((p) => [p.id, p.player.nickname]));

  return (
    <form onSubmit={handleSubmit} className="score-sheet flex flex-col gap-3">
      <div className="score-sheet__header text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        <span>Drag to set finish order — 1st place at top</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <ol className="seat-list list-none p-0 my-3 flex flex-col gap-2">
            {orderedIds.map((id, idx) => (
              <SortableFinishItem
                key={id}
                id={id}
                position={idx + 1}
                nickname={nicknames[id] ?? id}
                totalCount={orderedIds.length}
                onMoveUp={() => moveItem(idx, 'up')}
                onMoveDown={() => moveItem(idx, 'down')}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="mt-4">
        <Button type="submit" size="lg" variant="primary" loading={saving} className="w-full">
          Submit Finish Order
        </Button>
      </div>
    </form>
  );
}

// ─── Winner Pick Form (winner_pick) ───────────────────────────────────────────

interface WinnerPickFormProps {
  participations: Participation[];
  currentRound: number;
  saving: boolean;
  totals: Record<string, number>;
  target?: number;
  onSave: (winnerId: string) => void;
}

function WinnerPickForm({
  participations,
  currentRound,
  saving,
  totals,
  target,
  onSave,
}: WinnerPickFormProps) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Sort by current totals descending (highest first) so the leader is visible.
  const sorted = [...participations].sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0));
  const maxTotal = sorted.length > 0 ? (totals[sorted[0].id] ?? 0) : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    onSave(selectedId);
    setSelectedId(null);
  }

  return (
    <form onSubmit={handleSubmit} className="winner-pick-form flex flex-col gap-3">
      <div className="winner-pick-form__header text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        <span>Round {currentRound} — Pick the winner</span>
      </div>

      {/* Target progress bar */}
      {target && (
        <div className="winner-pick-form__progress mb-2">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Target: {target} points</span>
            <span>
              Leader: {maxTotal}/{target}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-2 rounded-full bg-indigo-500 dark:bg-indigo-400 transition-all duration-300"
              style={{ width: `${Math.min(100, (maxTotal / target) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Player list — tap to select winner */}
      <ol className="winner-pick-form__players list-none p-0 flex flex-col gap-2">
        {sorted.map((p) => {
          const total = totals[p.id] ?? 0;
          const isLeader = total === maxTotal && total > 0;
          const isSelected = selectedId === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                className={cn(
                  'winner-pick-player-btn',
                  'w-full flex items-center justify-between gap-3 px-4 py-3 min-h-14 rounded-xl border-2 transition-all duration-150',
                  isSelected
                    ? 'winner-pick-player-btn--selected border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 shadow-md'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10',
                )}
                onClick={() => setSelectedId(p.id)}
                aria-pressed={isSelected}
                aria-label={`Select ${p.player.nickname} as round winner`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Selection indicator */}
                  <span
                    className={cn(
                      'winner-pick-player-btn__indicator',
                      'flex-shrink-0 w-5 h-5 rounded-full border-2 transition-all duration-150',
                      isSelected
                        ? 'border-indigo-600 bg-indigo-600'
                        : 'border-slate-300 dark:border-slate-600',
                    )}
                    aria-hidden="true"
                  >
                    {isSelected && (
                      <svg viewBox="0 0 20 20" fill="white" className="w-full h-full p-0.5">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="winner-pick-player-btn__name text-base font-medium text-slate-900 dark:text-slate-100 truncate">
                    {p.player.nickname}
                    {isLeader && (
                      <span className="ml-1 text-green-600 dark:text-green-500" aria-label="Leader">
                        {' '}
                        ★
                      </span>
                    )}
                  </span>
                </div>
                {/* Running tally */}
                <span className="winner-pick-player-btn__score flex-shrink-0 text-xl font-bold text-slate-700 dark:text-slate-200">
                  {total}
                  {target && (
                    <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                      /{target}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-4">
        <Button
          type="submit"
          size="lg"
          variant="primary"
          loading={saving}
          disabled={!selectedId}
          className="w-full"
        >
          Award Point
        </Button>
      </div>
    </form>
  );
}

// ─── Score Entry Form ──────────────────────────────────────────────────────────

interface RoundEntry {
  roundScore: string;
  endedRound: boolean;
}

interface ScoreFormProps {
  participations: Participation[];
  currentRound: number;
  saving: boolean;
  moduleInfo: ModuleInfo | null;
  onSave: (entries: Record<string, RoundEntry>) => void;
}

function ScoreForm({ participations, currentRound, saving, moduleInfo, onSave }: ScoreFormProps) {
  const hasEndedRound =
    moduleInfo?.fields?.some((f) => f.name === 'endedRound' && f.type === 'boolean') ?? false;

  const wildRankHint = moduleInfo?.perRoundConfig
    ? moduleInfo.perRoundConfig.find((r) => r.round === currentRound)?.wildRank
    : undefined;

  const [entries, setEntries] = useState<Record<string, RoundEntry>>(() => {
    const init: Record<string, RoundEntry> = {};
    for (const p of participations) {
      init[p.id] = { roundScore: '', endedRound: false };
    }
    return init;
  });

  function setScore(id: string, value: string) {
    setEntries((prev) => ({ ...prev, [id]: { ...prev[id], roundScore: value } }));
  }

  function adjustScore(id: string, delta: number) {
    setEntries((prev) => {
      const current = prev[id]?.roundScore;
      const numVal = current === '' ? 0 : Number(current);
      return { ...prev, [id]: { ...prev[id], roundScore: String(numVal + delta) } };
    });
  }

  function setEnded(id: string) {
    setEntries((prev) => {
      const next = { ...prev };
      for (const pid of Object.keys(next)) {
        next[pid] = { ...next[pid], endedRound: pid === id ? !prev[pid].endedRound : false };
      }
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Coerce blank inputs to '0' — a player who scored nothing this round saves 0.
    const coerced: Record<string, RoundEntry> = {};
    for (const [id, entry] of Object.entries(entries)) {
      coerced[id] = { ...entry, roundScore: entry.roundScore === '' ? '0' : entry.roundScore };
    }
    onSave(coerced);
  }

  // Blank counts as valid (coerced to 0 on submit). Only a bare '-' is invalid.
  const allFilled = participations.every((p) => {
    const val = entries[p.id]?.roundScore;
    return val === '' || (val !== '-' && !isNaN(Number(val)));
  });

  return (
    <form onSubmit={handleSubmit} className="score-sheet flex flex-col gap-3">
      <div className="score-sheet__header text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
        <span>Round {currentRound}</span>
      </div>
      {wildRankHint && (
        <div className="wild-rank-hint text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-slate-100 dark:bg-slate-700 rounded px-2 py-1 mb-3">
          Wild this round: {wildRankHint}
        </div>
      )}
      {participations.map((p) => {
        const entry = entries[p.id] ?? { roundScore: '', endedRound: false };
        return (
          <div
            key={p.id}
            className="score-sheet__row flex items-center gap-3 justify-between py-2 border-b border-slate-200 dark:border-slate-700 flex-wrap"
          >
            <div className="score-sheet__player flex items-center gap-2 flex-1 flex-wrap min-w-0">
              <span className="score-sheet__nickname text-base font-medium text-slate-900 dark:text-slate-100">
                {p.player.nickname}
              </span>
              {hasEndedRound && (
                <button
                  type="button"
                  className={cn(
                    'ended-round-toggle',
                    'flex items-center gap-1 whitespace-nowrap rounded-lg border min-h-9 px-3 py-1 text-sm font-medium transition-colors duration-150',
                    entry.endedRound
                      ? 'ended-round-toggle--active bg-indigo-600 border-indigo-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-600 hover:text-indigo-600 dark:hover:text-indigo-400',
                  )}
                  onClick={() => setEnded(p.id)}
                  aria-pressed={entry.endedRound}
                  title="This player ended the round"
                >
                  <Flag size={14} />
                  Ended round
                </button>
              )}
            </div>
            <div className="score-sheet__stepper flex-shrink-0">
              <div className="score-input-wrapper flex items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    'score-stepper-btn',
                    'flex items-center justify-center flex-shrink-0 min-h-11 min-w-11 rounded-lg border text-lg font-bold',
                    'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100',
                    'hover:bg-indigo-600 hover:border-indigo-600 hover:text-white active:scale-95 transition-all duration-100',
                  )}
                  onClick={() => adjustScore(p.id, -1)}
                  aria-label={`Decrease score for ${p.player.nickname}`}
                >
                  −
                </button>
                <input
                  type="number"
                  className={cn(
                    'form-field__input score-sheet__score-input',
                    'w-20 text-center text-2xl font-medium min-h-[52px] px-2 py-2 rounded-lg border-2 appearance-none',
                    'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
                    'text-slate-900 dark:text-slate-100',
                    'focus:outline-none focus:border-indigo-600 transition-colors duration-150',
                  )}
                  value={entry.roundScore}
                  onChange={(e) => setScore(p.id, e.target.value)}
                  placeholder="Score"
                  aria-label={`Round score for ${p.player.nickname}`}
                  step={1}
                />
                <button
                  type="button"
                  className={cn(
                    'score-stepper-btn',
                    'flex items-center justify-center flex-shrink-0 min-h-11 min-w-11 rounded-lg border text-lg font-bold',
                    'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100',
                    'hover:bg-indigo-600 hover:border-indigo-600 hover:text-white active:scale-95 transition-all duration-100',
                  )}
                  onClick={() => adjustScore(p.id, 1)}
                  aria-label={`Increase score for ${p.player.nickname}`}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <div className="mt-4">
        <Button
          type="submit"
          size="lg"
          variant="primary"
          loading={saving}
          disabled={!allFilled}
          className="w-full"
        >
          Save Round
        </Button>
      </div>
    </form>
  );
}

// ─── Totals Table ──────────────────────────────────────────────────────────────

function TotalsTable({
  participations,
  totals,
  moduleInfo,
}: {
  participations: Participation[];
  totals: Record<string, number>;
  moduleInfo: ModuleInfo | null;
}) {
  const direction = moduleInfo?.scoringType?.config?.direction ?? 'low';
  const scores = participations.map((p) => totals[p.id] ?? 0);
  const leaderTotal = direction === 'low' ? Math.min(...scores) : Math.max(...scores);

  const sorted = [...participations].sort((a, b) => {
    const diff = (totals[a.id] ?? 0) - (totals[b.id] ?? 0);
    return direction === 'low' ? diff : -diff;
  });

  return (
    <div className="totals-table flex flex-col">
      <div className="totals-table__header flex justify-between px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
        <span>Player</span>
        <span>Total</span>
      </div>
      {sorted.map((p) => {
        const total = totals[p.id] ?? 0;
        const isLeader = total === leaderTotal;
        const isWarning = direction === 'low' && total >= 90;
        return (
          <div
            key={p.id}
            className={cn(
              'totals-table__row',
              'flex items-center justify-between p-3 min-h-11 border-b border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 transition-colors duration-100',
              isLeader && 'totals-table__row--leader bg-green-50 dark:bg-green-900/20',
              isWarning && 'totals-table__row--warning bg-red-50 dark:bg-red-900/20',
            )}
          >
            <span>
              {p.player.nickname}
              {isLeader && (
                <span
                  className="totals-table__leader-badge ml-1 text-green-600 dark:text-green-500"
                  aria-label="Leader"
                >
                  {' '}
                  ★
                </span>
              )}
            </span>
            <span className="totals-table__score text-lg font-bold text-slate-900 dark:text-slate-100">
              {total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Module Reference (generic scoring reference panel) ──────────────────────

function ModuleReference({ moduleInfo }: { moduleInfo: ModuleInfo }) {
  const [expanded, setExpanded] = useState(false);

  if (!moduleInfo.info?.scoring) return null;

  return (
    <div className="skyjo-reference overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <button
        type="button"
        className={cn(
          'skyjo-reference__toggle',
          'flex w-full items-center justify-between gap-2 px-4 py-3 min-h-11 text-left',
          'text-sm font-medium text-slate-900 dark:text-slate-100',
          'hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors duration-150',
        )}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span>Scoring Reference</span>
        <span className="text-sm text-slate-500 dark:text-slate-400" aria-hidden="true">
          {expanded ? '▲' : '▼'}
        </span>
      </button>
      {expanded && (
        <div className="skyjo-reference__body border-t border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
          <pre className="whitespace-pre-wrap font-sans text-sm" style={{ fontFamily: 'inherit' }}>
            {moduleInfo.info.scoring}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main Game Page ────────────────────────────────────────────────────────────

export function GamePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [game, setGame] = useState<GameDetail | null>(null);
  const [moduleInfo, setModuleInfo] = useState<ModuleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [undoConfirmOpen, setUndoConfirmOpen] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const pendingEventId = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [g, mods] = await Promise.all([
        getGame(id),
        listModules().catch(() => [] as ModuleInfo[]),
      ]);
      if (g.status === 'COMPLETE') {
        navigate(`/play/${id}/results`, { replace: true });
        return;
      }
      if (g.status === 'ABANDONED') {
        navigate('/', { replace: true });
        return;
      }
      setGame(g);
      const mod = mods.find((m) => m.id === g.moduleKey) ?? null;
      setModuleInfo(mod);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to load game';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const participations = game ? [...game.participations].sort((a, b) => a.seat - b.seat) : [];

  const currentRound = game ? getCurrentRound(participations, moduleInfo) : 1;
  const totals = game ? getTotals(participations) : {};

  // Live-pegging support (cribbage and future live-scoring games).
  const baseModuleId = game?.moduleKey.split('@')[0] ?? '';
  const CaptureComponent = game ? getCaptureComponent(baseModuleId) : null;
  const isCribbageLike = CaptureComponent !== null;
  const currentDeal = isCribbageLike ? getCribbageDeal(participations) : 1;
  const cribbageTarget = isCribbageLike ? (moduleInfo?.end?.target ?? 121) : 121;
  const cribbageWinner = isCribbageLike
    ? (participations.find((p) => (totals[p.id] ?? 0) >= cribbageTarget) ?? null)
    : null;

  async function handleSaveRound(
    entries: Record<string, { roundScore: string; endedRound: boolean }>,
  ) {
    if (!game || !id) return;

    if (!pendingEventId.current) {
      pendingEventId.current = genClientEventId();
    }
    const clientEventId = pendingEventId.current;

    const scores = participations.map((p) => ({
      participationId: p.id,
      roundScore: Number(entries[p.id]?.roundScore ?? 0),
      endedRound: entries[p.id]?.endedRound ?? false,
    }));

    setSaving(true);
    try {
      const result = await postEvent(id, {
        clientEventId,
        baseVersion: game.version,
        type: 'round_score',
        payload: { round: currentRound, scores },
      });

      pendingEventId.current = null;

      const updatedParticipations = participations.map((p) => {
        const ss = result.scoreStates.find((s) => s.participationId === p.id);
        return ss ? { ...p, scoreState: { payload: ss.payload } } : p;
      });

      setGame((prev) =>
        prev ? { ...prev, version: result.version, participations: updatedParticipations } : prev,
      );
    } catch (err) {
      if (err instanceof StaleVersionError) {
        toast('Score updated by another device — reloading', 'info');
        pendingEventId.current = null;
        await load();
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to save round';
        toast(msg, 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  // ─── Live-pegging handlers (cribbage) ────────────────────────────────────────

  /**
   * Post a single-player peg immediately as a round_score event.
   * Uses the next unique round number (max existing + 1).
   * Sequential: saving=true disables buttons, preventing concurrent posts.
   */
  async function handleAddScore(participationId: string, points: number) {
    if (!game || !id || saving) return;

    const nextRound = getCurrentRound(participations, moduleInfo);
    const clientEventId = genClientEventId();

    setSaving(true);
    try {
      const result = await postEvent(id, {
        clientEventId,
        baseVersion: game.version,
        type: 'round_score',
        payload: {
          round: nextRound,
          scores: [{ participationId, roundScore: points }],
        },
      });

      const updatedParticipations = participations.map((p) => {
        const ss = result.scoreStates.find((s) => s.participationId === p.id);
        return ss ? { ...p, scoreState: { payload: ss.payload } } : p;
      });
      setGame((prev) =>
        prev ? { ...prev, version: result.version, participations: updatedParticipations } : prev,
      );
    } catch (err) {
      if (err instanceof StaleVersionError) {
        toast('Score updated by another device — reloading', 'info');
        await load();
      } else {
        toast(err instanceof Error ? err.message : 'Failed to save peg', 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  /**
   * End the current deal: post an empty-scores round_score marker (no-op for
   * totals). The deal counter increments and the crib rotates.
   */
  async function handleEndDeal() {
    if (!game || !id || saving) return;

    const nextRound = getCurrentRound(participations, moduleInfo);
    const clientEventId = genClientEventId();

    setSaving(true);
    try {
      const result = await postEvent(id, {
        clientEventId,
        baseVersion: game.version,
        type: 'round_score',
        payload: {
          round: nextRound,
          scores: [],
        },
      });

      const updatedParticipations = participations.map((p) => {
        const ss = result.scoreStates.find((s) => s.participationId === p.id);
        return ss ? { ...p, scoreState: { payload: ss.payload } } : p;
      });
      setGame((prev) =>
        prev ? { ...prev, version: result.version, participations: updatedParticipations } : prev,
      );
    } catch (err) {
      if (err instanceof StaleVersionError) {
        toast('Score updated by another device — reloading', 'info');
        await load();
      } else {
        toast(err instanceof Error ? err.message : 'Failed to end deal', 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  /**
   * Undo the last peg (or End Deal marker) directly, without a confirmation dialog.
   * Used by CribbageCapture's undo button and the win-banner undo.
   */
  async function handleUndoLast() {
    if (!game || !id || saving) return;
    setSaving(true);
    try {
      const result = await undoLastRound(id);
      if (!result.undone) {
        toast('No rounds to undo', 'info');
        return;
      }
      const updatedParticipations = participations.map((p) => {
        const ss = result.scoreStates.find((s) => s.participationId === p.id);
        return ss ? { ...p, scoreState: { payload: ss.payload } } : p;
      });
      setGame((prev) =>
        prev ? { ...prev, version: result.version, participations: updatedParticipations } : prev,
      );
      toast('Last peg undone', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to undo peg', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWinnerPick(winnerId: string) {
    if (!game || !id) return;

    if (!pendingEventId.current) {
      pendingEventId.current = genClientEventId();
    }
    const clientEventId = pendingEventId.current;

    setSaving(true);
    try {
      const result = await postEvent(id, {
        clientEventId,
        baseVersion: game.version,
        type: 'winner_pick',
        payload: {
          round: currentRound,
          winnerId,
          participationIds: participations.map((p) => p.id),
        },
      });

      pendingEventId.current = null;

      // Update score state — winner_pick state uses totals at the top level.
      const updatedParticipations = participations.map((p) => {
        const ss = result.scoreStates.find((s) => s.participationId === p.id);
        return ss ? { ...p, scoreState: { payload: ss.payload } } : p;
      });

      setGame((prev) =>
        prev ? { ...prev, version: result.version, participations: updatedParticipations } : prev,
      );
    } catch (err) {
      if (err instanceof StaleVersionError) {
        toast('Score updated by another device — reloading', 'info');
        pendingEventId.current = null;
        await load();
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to save winner pick';
        toast(msg, 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFinishOrder(order: Array<{ participationId: string; rank: number }>) {
    if (!game || !id) return;

    if (!pendingEventId.current) {
      pendingEventId.current = genClientEventId();
    }
    const clientEventId = pendingEventId.current;

    setSaving(true);
    try {
      const result = await postEvent(id, {
        clientEventId,
        baseVersion: game.version,
        type: 'finish_order',
        payload: { order },
      });

      pendingEventId.current = null;

      const updatedParticipations = participations.map((p) => {
        const ss = result.scoreStates.find((s) => s.participationId === p.id);
        return ss ? { ...p, scoreState: { payload: ss.payload } } : p;
      });

      setGame((prev) =>
        prev ? { ...prev, version: result.version, participations: updatedParticipations } : prev,
      );

      await handleFinishAfterOrder();
    } catch (err) {
      if (err instanceof StaleVersionError) {
        toast('Score updated by another device — reloading', 'info');
        pendingEventId.current = null;
        await load();
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to save finish order';
        toast(msg, 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleFinishAfterOrder() {
    if (!id) return;
    try {
      const result = await finishGame(id);
      navigate(`/play/${id}/results`, { state: { result } });
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to finish game';
      toast(msg, 'error');
    }
  }

  async function handleFinish() {
    if (!id) return;
    setFinishing(true);
    try {
      const result = await finishGame(id);
      navigate(`/play/${id}/results`, { state: { result } });
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to finish game';
      toast(msg, 'error');
    } finally {
      setFinishing(false);
      setFinishConfirmOpen(false);
    }
  }

  async function handleCancel() {
    if (!id) return;
    setCancelling(true);
    try {
      await cancelGame(id);
      navigate('/');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to cancel game';
      toast(msg, 'error');
    } finally {
      setCancelling(false);
      setCancelConfirmOpen(false);
    }
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteGame(id);
      navigate('/');
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Failed to delete game';
      toast(msg, 'error');
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }

  async function handleUndoLastRound() {
    if (!game || !id) return;
    setUndoing(true);
    try {
      const result = await undoLastRound(id);
      if (!result.undone) {
        toast('No rounds to undo', 'info');
        return;
      }
      const updatedParticipations = participations.map((p) => {
        const ss = result.scoreStates.find((s) => s.participationId === p.id);
        return ss ? { ...p, scoreState: { payload: ss.payload } } : p;
      });
      setGame((prev) =>
        prev ? { ...prev, version: result.version, participations: updatedParticipations } : prev,
      );
      toast('Last round undone', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to undo round';
      toast(msg, 'error');
    } finally {
      setUndoing(false);
      setUndoConfirmOpen(false);
    }
  }

  const isCreator = user?.id === game?.createdById;

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

  if (!game) {
    return (
      <AppShell>
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-slate-500 dark:text-slate-400">Game not found.</p>
        </main>
      </AppShell>
    );
  }

  return (
    <>
      <AppShell>
        <main className="max-w-2xl mx-auto px-4 sm:px-6 pb-16 pt-6">
          {/* ── Game Header ───────────────────────────── */}
          <div className="game-header bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-4">
            <div className="game-header__title-row flex items-center justify-between gap-3 flex-wrap">
              <h1 className="game-header__title text-xl font-bold text-slate-900 dark:text-slate-100 m-0">
                {isRankOrder(moduleInfo)
                  ? (moduleInfo?.name ?? game.moduleKey)
                  : isCribbageLike
                    ? `${moduleInfo?.name ?? game.moduleKey} — Deal ${currentDeal}`
                    : isWinnerPick(moduleInfo)
                      ? `${moduleInfo?.name ?? game.moduleKey} — Round ${currentRound}${
                          moduleInfo?.end?.type === 'target' && moduleInfo.end.target
                            ? ` (first to ${moduleInfo.end.target})`
                            : ''
                        }`
                      : `${moduleInfo?.name ?? game.moduleKey} — Round ${currentRound}${
                          moduleInfo?.end?.type === 'fixed_rounds' && moduleInfo.end.rounds
                            ? ` of ${moduleInfo.end.rounds}`
                            : moduleInfo?.end?.type === 'target' && moduleInfo.end.target
                              ? ` (target: ${moduleInfo.end.target})`
                              : ''
                        }`}
              </h1>
              {moduleInfo && moduleInfo.maturity !== 'released' && (
                <Badge variant="warning" data-testid="pre-release-badge">
                  Pre-release
                </Badge>
              )}
              <div className="flex gap-2 items-center flex-wrap">
                {isCreator && !isRankOrder(moduleInfo) && !isCribbageLike && currentRound > 1 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="undo-last-round-btn"
                    onClick={() => setUndoConfirmOpen(true)}
                  >
                    Undo last round
                  </Button>
                )}
                {isCreator && (
                  <Button variant="secondary" size="sm" onClick={() => setCancelConfirmOpen(true)}>
                    Cancel game
                  </Button>
                )}
                {isCreator && (
                  <Button variant="danger" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
                    Delete
                  </Button>
                )}
                {!isRankOrder(moduleInfo) && (
                  <Button variant="danger" size="sm" onClick={() => setFinishConfirmOpen(true)}>
                    Finish Game
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-3">
              {moduleInfo ? <ModuleReference moduleInfo={moduleInfo} /> : null}
            </div>
          </div>

          {/* ── Per-module board visual (presentation registry) ───────── */}
          {(() => {
            const baseModuleId = game.moduleKey.split('@')[0];
            const BoardComponent = getBoardComponent(baseModuleId);
            if (!BoardComponent) return null;
            const target = moduleInfo?.end?.target ?? 121;
            return (
              <Card className="p-4 mb-4" data-testid="cribbage-board-card">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  Board
                </h2>
                <BoardComponent participations={participations} target={target} />
              </Card>
            );
          })()}

          {/* ── Live Totals (numeric + winner_pick games only) ───────── */}
          {/* Hidden for rank_order, winner_pick, and games that have a board
              (the board already shows each player's running score). */}
          {!isRankOrder(moduleInfo) &&
            !isWinnerPick(moduleInfo) &&
            !getBoardComponent(game.moduleKey.split('@')[0]) && (
              <Card className="p-4 mb-4">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
                  Running Totals
                </h2>
                <TotalsTable
                  participations={participations}
                  totals={totals}
                  moduleInfo={moduleInfo}
                />
              </Card>
            )}

          {/* ── Score Entry / Finish Order / Winner Pick Entry ──────── */}
          <Card className="p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
              {isRankOrder(moduleInfo)
                ? 'Set Finish Order'
                : isWinnerPick(moduleInfo)
                  ? 'Pick Round Winner'
                  : 'Enter Scores'}
            </h2>
            {isRankOrder(moduleInfo) ? (
              <FinishOrderForm
                participations={participations}
                saving={saving}
                onSave={handleSaveFinishOrder}
              />
            ) : isWinnerPick(moduleInfo) ? (
              <WinnerPickForm
                key={currentRound}
                participations={participations}
                currentRound={currentRound}
                saving={saving}
                totals={totals}
                target={moduleInfo?.end?.type === 'target' ? moduleInfo.end.target : undefined}
                onSave={handleSaveWinnerPick}
              />
            ) : (
              (() => {
                if (CaptureComponent) {
                  // Win banner: shown when a player crosses the target mid-deal.
                  if (cribbageWinner) {
                    return (
                      <div
                        className="flex flex-col items-center gap-4 py-4 text-center"
                        data-testid="win-banner"
                      >
                        <div
                          className="text-2xl font-bold text-green-600 dark:text-green-400"
                          data-testid="win-banner-name"
                        >
                          {cribbageWinner.player.nickname} wins!
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                          Crossed {cribbageTarget} mid-deal. Confirm to finish the game, or undo the
                          last peg if it was a mistake.
                        </p>
                        <div className="flex gap-3 flex-wrap justify-center">
                          <Button
                            variant="secondary"
                            loading={saving}
                            onClick={() => void handleUndoLast()}
                            data-testid="win-banner-undo-btn"
                          >
                            ↶ Undo last peg
                          </Button>
                          <Button
                            variant="primary"
                            loading={finishing}
                            onClick={() => setFinishConfirmOpen(true)}
                            data-testid="win-banner-finish-btn"
                          >
                            Finish Game
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <CaptureComponent
                      participations={participations}
                      currentDeal={currentDeal}
                      saving={saving}
                      target={cribbageTarget}
                      addScore={handleAddScore}
                      endDeal={handleEndDeal}
                      onUndoLast={handleUndoLast}
                    />
                  );
                }
                return (
                  <ScoreForm
                    key={currentRound}
                    participations={participations}
                    currentRound={currentRound}
                    saving={saving}
                    moduleInfo={moduleInfo}
                    onSave={handleSaveRound}
                  />
                );
              })()
            )}
          </Card>
        </main>
      </AppShell>

      {/* ── Finish Confirmation ───────────────────────── */}
      <Dialog
        open={finishConfirmOpen}
        onClose={() => setFinishConfirmOpen(false)}
        title="Finish Game?"
      >
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          This will end the game and calculate final results. You can&apos;t add more rounds after
          finishing.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setFinishConfirmOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={finishing} onClick={handleFinish}>
            Finish Game
          </Button>
        </div>
      </Dialog>

      {/* ── Cancel Game Confirmation ──────────────────── */}
      <Dialog
        open={cancelConfirmOpen}
        onClose={() => setCancelConfirmOpen(false)}
        title="Cancel this game?"
      >
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Cancel this game? Scores will be kept but the game ends. It will show as Abandoned in
          history.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setCancelConfirmOpen(false)}>
            Keep playing
          </Button>
          <Button variant="danger" loading={cancelling} onClick={handleCancel}>
            Cancel game
          </Button>
        </div>
      </Dialog>

      {/* ── Delete Game Confirmation ──────────────────── */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete this game?"
      >
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Delete this game permanently? This can&apos;t be undone. All scores and events will be
          removed.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>
            Keep game
          </Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>
            Delete game
          </Button>
        </div>
      </Dialog>

      {/* ── Undo Last Round Confirmation ─────────────── */}
      <Dialog
        open={undoConfirmOpen}
        onClose={() => setUndoConfirmOpen(false)}
        title="Undo last round?"
      >
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          This will remove the most recently saved round. The scores will revert to the previous
          state.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setUndoConfirmOpen(false)}>
            Keep it
          </Button>
          <Button variant="danger" loading={undoing} onClick={handleUndoLastRound}>
            Undo round
          </Button>
        </div>
      </Dialog>
    </>
  );
}
