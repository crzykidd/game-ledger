import * as React from 'react';
import { cn } from './utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  glass?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = false, glass = false, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-2xl',
        // Light: white surface with clear border, dark: elevated slate with strong border
        'bg-white dark:bg-slate-800',
        'border border-slate-200 dark:border-slate-700',
        // Light shadow is subtle; dark shadow is deeper so the card lifts off slate-950
        'shadow-sm dark:shadow-md dark:shadow-slate-950/60',
        glass && 'glass',
        hover && 'cursor-pointer',
        'transition-all duration-200 ease-out',
        hover && [
          'hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-slate-950/80',
          'hover:-translate-y-0.5',
          'hover:border-indigo-200 dark:hover:border-indigo-700/60',
        ],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-base font-semibold leading-tight text-slate-900 dark:text-slate-100',
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    // Bumped from slate-400 to slate-300 in dark for better readability
    className={cn('text-sm text-slate-500 dark:text-slate-300', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';
