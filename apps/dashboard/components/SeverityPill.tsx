import type { Severity } from '@sec/shared';

const STYLES: Record<Severity, string> = {
  critical: 'bg-[var(--color-critical)]/20 text-[var(--color-critical)] border-[var(--color-critical)]/40',
  high: 'bg-[var(--color-high)]/20 text-[var(--color-high)] border-[var(--color-high)]/40',
  medium: 'bg-[var(--color-medium)]/20 text-[var(--color-medium)] border-[var(--color-medium)]/40',
  low: 'bg-[var(--color-low)]/20 text-[var(--color-low)] border-[var(--color-low)]/40',
  unknown: 'bg-[var(--color-unknown)]/20 text-[var(--color-unknown)] border-[var(--color-unknown)]/40',
};

export function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}
