function tierClasses(priority: number): string {
  if (priority >= 80)
    return 'bg-[var(--color-critical)]/20 text-[var(--color-critical)] border-[var(--color-critical)]/40';
  if (priority >= 60)
    return 'bg-[var(--color-high)]/20 text-[var(--color-high)] border-[var(--color-high)]/40';
  if (priority >= 40)
    return 'bg-[var(--color-medium)]/20 text-[var(--color-medium)] border-[var(--color-medium)]/40';
  return 'bg-[var(--color-surface-2)] text-[var(--color-muted)] border-zinc-700';
}

export function PriorityBadge({ priority }: { priority: number }) {
  return (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums ${tierClasses(
        priority,
      )}`}
      title={`Priority ${priority}`}
    >
      {priority}
    </span>
  );
}
