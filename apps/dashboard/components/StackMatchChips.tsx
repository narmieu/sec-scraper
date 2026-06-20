import type { StackMatch } from '@sec/shared';
import { StatusBadge } from './StatusBadge';

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
        <StatusBadge key={p} variant="stack">
          {p}
        </StatusBadge>
      ))}
      <span className="text-[11px] text-muted-foreground">
        {REASON_LABEL[match.reason]} · {match.score}
      </span>
    </div>
  );
}
