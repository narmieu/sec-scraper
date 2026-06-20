'use client';
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const statusBadgeVariants = cva(
  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap',
  {
    variants: {
      variant: {
        'severity-critical':
          'bg-[var(--color-critical)]/15 text-[var(--color-critical)] border-[var(--color-critical)]/40',
        'severity-high':
          'bg-[var(--color-high)]/15 text-[var(--color-high)] border-[var(--color-high)]/40',
        'severity-medium':
          'bg-[var(--color-medium)]/15 text-[var(--color-medium)] border-[var(--color-medium)]/40',
        'severity-low':
          'bg-[var(--color-low)]/15 text-[var(--color-low)] border-[var(--color-low)]/40',
        'severity-unknown':
          'bg-[var(--color-unknown)]/15 text-[var(--color-unknown)] border-[var(--color-unknown)]/40',
        'exposure-affected':
          'bg-red-500/20 text-red-300 border-red-500/40',
        'exposure-potential':
          'bg-amber-500/20 text-amber-300 border-amber-500/40',
        'exposure-safe':
          'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        kev: 'bg-red-500/20 text-red-300 border-red-500/40',
        stack:
          'bg-violet-500/20 text-violet-200 border-violet-500/50',
        'exploit-active':
          'bg-red-600/20 text-red-400 border-red-600/40',
        'exploit-weaponized':
          'bg-orange-500/20 text-orange-300 border-orange-500/40',
        'exploit-poc':
          'bg-amber-500/20 text-amber-300 border-amber-500/40',
        patch:
          'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      },
    },
    defaultVariants: {
      variant: 'severity-unknown',
    },
  },
);

export type StatusBadgeVariant = NonNullable<
  VariantProps<typeof statusBadgeVariants>['variant']
>;

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  icon?: React.ComponentType<{ className?: string }>;
  variant: StatusBadgeVariant;
}

export function StatusBadge({
  variant,
  icon: Icon,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(statusBadgeVariants({ variant }), className)}
      {...props}
    >
      {Icon && <Icon className="size-3 shrink-0" />}
      {children}
    </span>
  );
}
