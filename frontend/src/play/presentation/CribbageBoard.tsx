import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { BoardProps } from './index';

// ─── Board geometry ────────────────────────────────────────────────────────────

const SVG_WIDTH = 580;
const LABEL_WIDTH = 84; // left margin for player name
const SCORE_WIDTH = 44; // right margin for numeric score
const TRACK_START = LABEL_WIDTH;
const TRACK_END = SVG_WIDTH - SCORE_WIDTH;
const TRACK_WIDTH = TRACK_END - TRACK_START;

const ROW_HEIGHT = 56;
const TOP_MARGIN = 30; // room for line labels above first track
const BOTTOM_MARGIN = 12;

const FRONT_PEG_R = 8;
const REAR_PEG_R = 5.5;

// Color palette: one entry per player slot (support up to 3 players)
const PLAYER_COLORS = [
  { fill: '#6366f1', rearFill: 'none', rearStroke: '#a5b4fc', label: '#4f46e5' },
  { fill: '#f43f5e', rearFill: 'none', rearStroke: '#fda4af', label: '#e11d48' },
  { fill: '#10b981', rearFill: 'none', rearStroke: '#6ee7b7', label: '#059669' },
];

// Skunk and finish positions
const SKUNK_LINES: Array<{ score: number; label: string; dashed: boolean; color: string }> = [
  { score: 61, label: '61', dashed: true, color: '#f97316' },
  { score: 91, label: '91', dashed: true, color: '#eab308' },
];

function scoreToX(score: number, target: number): number {
  const clamped = Math.max(0, Math.min(score, target));
  return TRACK_START + (clamped / target) * TRACK_WIDTH;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CribbageBoard({ participations, target }: BoardProps) {
  const prefersReducedMotion = useReducedMotion();

  const numPlayers = participations.length;
  const svgHeight = TOP_MARGIN + numPlayers * ROW_HEIGHT + BOTTOM_MARGIN;

  // Pre-compute per-player peg data
  const pegData = participations.map((p) => {
    const rounds = p.scoreState?.payload?.rounds ?? [];
    const totals = p.scoreState?.payload?.totals ?? {};
    const total = totals[p.id] ?? 0;
    // Rear peg: scan backward for this player's OWN last non-zero increment.
    // Using the global last round would give 0 when another player pegged last
    // (interleaved live pegging), collapsing front=rear. Each player's rear peg
    // tracks their own previous position independently.
    let lastDelta = 0;
    for (let i = rounds.length - 1; i >= 0; i--) {
      const delta = rounds[i].scores[p.id] ?? 0;
      if (delta > 0) {
        lastDelta = delta;
        break;
      }
    }
    const rearScore = Math.max(0, total - lastDelta);
    const isWinner = total >= target;
    return { total, rearScore, isWinner };
  });

  return (
    <div className="cribbage-board w-full overflow-x-auto" data-testid="cribbage-board">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
        className="w-full max-w-full"
        aria-label="Cribbage board"
        role="img"
      >
        {/* ── Skunk lines (61, 91) ── */}
        {SKUNK_LINES.map(({ score, label, dashed, color }) => {
          const x = scoreToX(score, target);
          const lineY1 = TOP_MARGIN - 16;
          const lineY2 = svgHeight - BOTTOM_MARGIN + 4;
          return (
            <g key={score} data-testid={`skunk-line-${score}`}>
              <line
                x1={x}
                y1={lineY1}
                x2={x}
                y2={lineY2}
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray={dashed ? '4 3' : undefined}
                opacity={0.7}
              />
              <text
                x={x}
                y={lineY1 - 2}
                textAnchor="middle"
                fontSize={9}
                fill={color}
                fontWeight="600"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* ── Finish line at target (121) ── */}
        {(() => {
          const x = scoreToX(target, target);
          const lineY1 = TOP_MARGIN - 16;
          const lineY2 = svgHeight - BOTTOM_MARGIN + 4;
          return (
            <g data-testid="finish-line-121">
              <line
                x1={x}
                y1={lineY1}
                x2={x}
                y2={lineY2}
                stroke="#6366f1"
                strokeWidth={2}
                opacity={0.9}
              />
              <text
                x={x}
                y={lineY1 - 2}
                textAnchor="middle"
                fontSize={9}
                fill="#6366f1"
                fontWeight="700"
              >
                {target}
              </text>
            </g>
          );
        })()}

        {/* ── Player tracks ── */}
        {participations.map((p, i) => {
          const cy = TOP_MARGIN + i * ROW_HEIGHT + ROW_HEIGHT / 2;
          const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
          const { total, rearScore, isWinner } = pegData[i];
          const frontX = scoreToX(total, target);
          const rearX = scoreToX(rearScore, target);

          return (
            <g key={p.id} data-testid={`player-track-${p.id}`}>
              {/* Track background line */}
              <line
                x1={TRACK_START}
                y1={cy}
                x2={TRACK_END}
                y2={cy}
                className="stroke-slate-300 dark:stroke-slate-600"
                strokeWidth={3}
                strokeLinecap="round"
              />

              {/* Street tick marks every 5 holes */}
              {Array.from({ length: 24 }, (_, j) => {
                const s = (j + 1) * 5;
                const tx = scoreToX(s, target);
                const tickH = s % 10 === 0 ? 6 : 4;
                return (
                  <line
                    key={s}
                    x1={tx}
                    y1={cy - tickH}
                    x2={tx}
                    y2={cy + tickH}
                    className="stroke-slate-400 dark:stroke-slate-500"
                    strokeWidth={0.75}
                  />
                );
              })}

              {/* Player name (left) */}
              <text
                x={TRACK_START - 6}
                y={cy + 4}
                textAnchor="end"
                fontSize={12}
                fontWeight={isWinner ? '700' : '500'}
                className={isWinner ? undefined : 'fill-slate-600 dark:fill-slate-300'}
                fill={isWinner ? color.label : undefined}
              >
                {p.player.nickname}
              </text>

              {/* Current score (right) */}
              <text
                x={TRACK_END + 6}
                y={cy + 4}
                textAnchor="start"
                fontSize={13}
                fontWeight="700"
                className={isWinner ? undefined : 'fill-slate-800 dark:fill-slate-100'}
                fill={isWinner ? color.label : undefined}
                data-testid={`score-label-${p.id}`}
              >
                {total}
              </text>

              {/* Winner flag */}
              {isWinner && (
                <text
                  x={TRACK_END + 38}
                  y={cy + 4}
                  textAnchor="start"
                  fontSize={11}
                  fill={color.label}
                  fontWeight="700"
                  data-testid={`winner-flag-${p.id}`}
                >
                  ★
                </text>
              )}

              {/* Rear peg (hollow, lighter — only shown after first hand) */}
              {rearScore > 0 && (
                <circle
                  cx={rearX}
                  cy={cy}
                  r={REAR_PEG_R}
                  fill={color.rearFill}
                  stroke={color.rearStroke}
                  strokeWidth={2}
                  data-testid={`rear-peg-${p.id}`}
                  data-score={rearScore}
                />
              )}

              {/* Front peg (filled, animated) — shown once score > 0 */}
              {total > 0 && (
                <motion.circle
                  cx={frontX}
                  cy={cy}
                  r={FRONT_PEG_R}
                  fill={color.fill}
                  animate={{ cx: frontX }}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 120, damping: 20 }
                  }
                  data-testid={`front-peg-${p.id}`}
                  data-score={total}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-4 mt-2 px-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span
            className="inline-block w-3 h-3 rounded-full border-2"
            style={{ borderColor: '#a5b4fc', background: 'transparent' }}
          />
          <span>Rear peg (prev hand)</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-block w-3 h-3 rounded-full bg-indigo-500" />
          <span>Front peg (current)</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span style={{ color: '#f97316', fontWeight: 700 }}>— —</span>
          <span>Skunk lines (61/91)</span>
        </div>
      </div>
    </div>
  );
}
