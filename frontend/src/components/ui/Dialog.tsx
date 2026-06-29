/**
 * Dialog — modal overlay using Tailwind + the new design foundation.
 * Modal overlay component; keeps role="dialog" for test compat.
 */
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from './utils';

interface DialogProps {
  open: boolean;
  onClose(): void;
  title?: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-sm',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'relative w-full max-w-md rounded-2xl',
          'bg-white dark:bg-slate-800',
          'border border-slate-200 dark:border-slate-700',
          'shadow-xl dark:shadow-slate-950/60',
          'p-6',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center',
                'text-slate-400 dark:text-slate-500',
                'hover:bg-slate-100 dark:hover:bg-slate-700',
                'transition-colors duration-150',
              )}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
