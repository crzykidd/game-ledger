import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from './utils';

export interface SegmentOption<T extends string = string> {
  label: string;
  value: T;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Unique layout id for Framer Motion spring indicator. Defaults to "seg-indicator". */
  layoutId?: string;
  className?: string;
  'aria-label'?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  layoutId = 'seg-indicator',
  className,
  'aria-label': ariaLabel = 'Options',
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'relative flex p-1 rounded-xl gap-0.5',
        'bg-slate-100/80 dark:bg-slate-800/80',
        'border border-slate-200/60 dark:border-slate-600/60',
        className,
      )}
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative z-10 px-3 py-1.5 text-sm font-medium rounded-lg',
              'transition-colors duration-150 focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-indigo-500',
              isActive
                ? 'text-indigo-700 dark:text-indigo-100'
                : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100',
            )}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className={cn(
                  'absolute inset-0 rounded-lg z-[-1]',
                  // Light: white pill with shadow; Dark: slate-700 pill — clear separation
                  'bg-white dark:bg-slate-700',
                  'shadow-sm dark:shadow-slate-900/60',
                  'border border-transparent dark:border-slate-600/40',
                )}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
