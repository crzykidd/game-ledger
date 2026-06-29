import React from 'react';
import { cn } from './utils';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

export function Spinner({ size = 'md' }: SpinnerProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block rounded-full animate-spin',
        'border-2 border-slate-300 dark:border-slate-600 border-t-indigo-600 dark:border-t-indigo-400',
        size === 'sm' && 'w-4 h-4',
        size === 'md' && 'w-6 h-6',
        size === 'lg' && 'w-8 h-8',
      )}
    />
  );
}
