import type { StackMatch } from '@sec/shared';

const REASON_LABEL: Record<StackMatch['reason'], string> = {
  'direct-dep': 'direct',
  transitive: 'transitive',
  framework: 'framework',
  'topic-mention': 'mention',
};

export function StackMatchChips({ match }: { match: StackMatch }) {
  if (match.score === 0 || match.packages.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {match.packages.slice(0, 4).map((p) => (
        <span
          key={p}
          className="rounded bg-[var(--color-accent)]/15 px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-accent)]"
        >
          {p}
        </span>
      ))}
      <span className="text-[11px] text-[var(--color-muted)]">
        {REASON_LABEL[match.reason]} · {match.score}
      </span>
    </div>
  );
}
