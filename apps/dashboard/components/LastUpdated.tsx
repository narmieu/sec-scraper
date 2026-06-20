import { IconClock } from '@tabler/icons-react';
import type { LastRun } from '@sec/shared';

function relativeMin(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const mins = (Date.now() - t) / 60_000;
  if (mins < 60) return `${Math.max(1, Math.round(mins))} min ago`;
  const h = mins / 60;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function LastUpdated({ lastRun }: { lastRun: LastRun | null }) {
  if (!lastRun || !lastRun.finishedAt) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <IconClock className="size-3.5 shrink-0" />
      {relativeMin(lastRun.finishedAt)}
    </span>
  );
}
