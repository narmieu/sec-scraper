import type { SourcesFile } from '@sec/shared';

const COLOR: Record<string, string> = {
  closed: 'bg-emerald-500',
  'half-open': 'bg-yellow-400',
  open: 'bg-red-500',
};

export function SourceHealth({ sources }: { sources: SourcesFile }) {
  const entries = Object.entries(sources);
  if (entries.length === 0) return null;
  return (
    <footer className="border-t border-zinc-800 px-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
          Source health
        </span>
        {entries.map(([id, h]) => (
          <span
            key={id}
            title={h.lastError ? `${id}: ${h.lastError}` : `${id}: ${h.state}`}
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"
          >
            <span className={`h-2 w-2 rounded-full ${COLOR[h.state] ?? 'bg-zinc-500'}`} />
            {id}
          </span>
        ))}
      </div>
    </footer>
  );
}
