import React, { useState } from 'react';
import { cn } from '../components/ui/utils';

interface SkyjoReferenceProps {
  defaultExpanded?: boolean;
}

export function SkyjoReference({ defaultExpanded = false }: SkyjoReferenceProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="collapsible overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <button
        className={cn(
          'collapsible__toggle',
          'flex w-full items-center justify-between gap-2 px-4 py-3 min-h-11 text-left',
          'text-sm font-medium text-slate-900 dark:text-slate-100',
          'hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors duration-150',
        )}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        type="button"
      >
        <span>Scoring Reference</span>
        <span
          className="collapsible__chevron text-sm text-slate-500 dark:text-slate-400"
          aria-hidden="true"
        >
          {expanded ? '▲' : '▼'}
        </span>
      </button>
      {expanded && (
        <div className="collapsible__body border-t border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-900 dark:text-slate-100">
          <p className="font-medium mb-2">Skyjo Quick Reference</p>
          <ul className="skyjo-ref__list pl-4 flex flex-col gap-2 mt-2 leading-relaxed">
            <li>Each card&apos;s face value counts toward your round score.</li>
            <li>Values range from -2 to 12 (special cards: -2, 0, and 1–12).</li>
            <li>
              <strong>Doubling Rule:</strong> If the player who ended the round does NOT have the
              strictly lowest score AND their score is greater than 0, their score is doubled.
            </li>
            <li>Totals accumulate across rounds.</li>
            <li>Lowest cumulative total wins when the game ends.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
