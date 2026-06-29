/**
 * Capture registry — maps a base module id to an optional hand-capture component.
 *
 * Mirrors the presentation registry (frontend/src/play/presentation/index.ts).
 * Returns null for modules that use the generic numeric ScoreForm in GamePage.
 *
 * Usage:
 *   const Capture = getCaptureComponent('cribbage');
 *   if (Capture) return <Capture participations={...} currentDeal={n} saving={...} ... />;
 *
 * Strip @version from moduleKey before calling (e.g. 'cribbage@1' → 'cribbage').
 */

import type React from 'react';
import type { Participation } from '../../api/play';
import { CribbageCapture } from './CribbageCapture';

/** Props contract for all custom capture components (live-pegging model). */
export interface CaptureProps {
  /** Participations sorted by seat (ascending) — same slice used in GamePage. */
  participations: Participation[];
  /**
   * Current deal number (1-based). For cribbage:
   * 1 + count of empty-scores round_score marker events in ScoreState.
   */
  currentDeal: number;
  /** True while any async op (add peg, end deal, undo) is in flight. */
  saving: boolean;
  /** Score target (e.g. 121 for cribbage). Used to detect win and disable scoring. */
  target: number;
  /**
   * Post a single-player peg immediately. Posts a round_score event with a
   * unique, strictly-increasing round number and one scorer. Returns after the
   * backend responds and GamePage has refreshed ScoreState.
   */
  addScore: (participationId: string, points: number) => Promise<void>;
  /**
   * End the current deal: posts an empty-scores round_score marker (no-op for
   * totals) so the deal number increments and the crib rotates.
   */
  endDeal: () => Promise<void>;
  /**
   * Undo the last peg. Calls POST /api/games/:id/undo-last-round, which deletes
   * the event with the highest round number (the most recent peg or End Deal marker)
   * and re-materializes ScoreState.
   */
  onUndoLast: () => Promise<void>;
}

/** Registry: base module id → capture component. */
const CAPTURE_REGISTRY: Record<string, React.ComponentType<CaptureProps>> = {
  cribbage: CribbageCapture,
};

/**
 * Returns a custom capture component for the given base module id, or null
 * if the module uses the generic ScoreForm.
 *
 * @param moduleId - Base module id with no @version suffix.
 */
export function getCaptureComponent(moduleId: string): React.ComponentType<CaptureProps> | null {
  return CAPTURE_REGISTRY[moduleId] ?? null;
}
