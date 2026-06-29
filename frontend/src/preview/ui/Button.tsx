import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl',
    'font-medium transition-all duration-200 focus-visible:outline-none',
    'focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-40 select-none',
    'active:scale-95',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: [
          'bg-indigo-600 text-white shadow-md shadow-indigo-500/20',
          'hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/30',
          'hover:-translate-y-px',
        ].join(' '),
        secondary: [
          'bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200',
          'border border-slate-200/80 dark:border-slate-700/80',
          'hover:bg-slate-50 dark:hover:bg-slate-700/80 shadow-sm',
        ].join(' '),
        ghost: [
          'text-slate-600 dark:text-slate-400',
          'hover:bg-slate-100 dark:hover:bg-slate-800',
          'hover:text-slate-900 dark:hover:text-slate-100',
        ].join(' '),
        danger: [
          'bg-red-600 text-white shadow-md shadow-red-500/20',
          'hover:bg-red-700 hover:shadow-lg hover:shadow-red-500/30',
          'hover:-translate-y-px',
        ].join(' '),
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props}>
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
