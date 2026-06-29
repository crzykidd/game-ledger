/**
 * Presentation registry — maps a base module id to an optional board component.
 *
 * Usage:
 *   const Board = getBoardComponent('cribbage');
 *   if (Board) return <Board participations={...} target={121} />;
 *
 * BoardProps is deliberately minimal so future modules can register without
 * reshaping their data. Strip @version from moduleKey before calling
 * (e.g. 'cribbage@1' → 'cribbage').
 */

import type React from 'react';
import type { Participation } from '../../api/play';
import { CribbageBoard } from './CribbageBoard';

export interface BoardProps {
  /** Ordered participations — same slice used in GamePage (sorted by seat). */
  participations: Participation[];
  /** Win threshold for the module (e.g. 121 for cribbage). */
  target: number;
}

/** Registry: base module id → board component. */
const BOARD_REGISTRY: Record<string, React.ComponentType<BoardProps>> = {
  cribbage: CribbageBoard,
};

/**
 * Returns a board component for the given base module id, or null if no
 * custom presentation is registered.
 *
 * @param moduleId - Base module id with no @version suffix.
 */
export function getBoardComponent(moduleId: string): React.ComponentType<BoardProps> | null {
  return BOARD_REGISTRY[moduleId] ?? null;
}
