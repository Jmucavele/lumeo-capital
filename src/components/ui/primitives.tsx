import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl2 border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 shadow-panel',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pt-5 pb-2 flex items-start justify-between gap-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-semibold tracking-wide uppercase text-ink-500 dark:text-parchment-200/70', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 text-sm',
        'placeholder:text-ink-400 dark:placeholder:text-parchment-200/40',
        'focus:border-brass-500',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm',
        'placeholder:text-ink-400 dark:placeholder:text-parchment-200/40 focus:border-brass-500',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 text-sm focus:border-brass-500',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-medium text-ink-500 dark:text-parchment-200/70 mb-1 block', className)} {...props} />;
}

const badgeStyles: Record<string, string> = {
  ativo: 'bg-moss-500/15 text-moss-600 dark:text-moss-400',
  atraso: 'bg-rust-500/15 text-rust-500 dark:text-rust-400',
  liquidado: 'bg-ink-500/10 text-ink-500 dark:text-parchment-200/60',
  inativo: 'bg-ink-500/10 text-ink-500 dark:text-parchment-200/60',
  bloqueado: 'bg-rust-500/15 text-rust-500',
  neutro: 'bg-brass-500/15 text-brass-600 dark:text-brass-400',
};

export function Badge({ tone = 'neutro', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof badgeStyles }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
        badgeStyles[tone] ?? badgeStyles.neutro,
        className
      )}
      {...props}
    />
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <p className="font-display text-lg font-semibold text-ink-800 dark:text-parchment-100">{title}</p>
      {description && <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin h-5 w-5 text-brass-500', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
