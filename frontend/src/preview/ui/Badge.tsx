import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
        success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
        warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
        danger: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
        muted: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
        active: ['bg-indigo-600 text-white', 'shadow-sm shadow-indigo-500/30'].join(' '),
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
