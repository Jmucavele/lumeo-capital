import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'icon';

const variants: Record<Variant, string> = {
  primary:
    'bg-brass-500 text-ink-950 hover:bg-brass-400 shadow-panel',
  secondary:
    'bg-ink-100 text-ink-900 hover:bg-ink-200 dark:bg-ink-800 dark:text-parchment-100 dark:hover:bg-ink-700',
  outline:
    'border border-ink-200 dark:border-ink-700 bg-transparent hover:bg-ink-50 dark:hover:bg-ink-800 text-ink-800 dark:text-parchment-100',
  ghost: 'bg-transparent hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-700 dark:text-parchment-200',
  danger: 'bg-rust-500 text-white hover:bg-rust-400',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm rounded-lg',
  md: 'h-10 px-4 text-sm rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';
