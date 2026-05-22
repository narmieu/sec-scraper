'use client';
import { useState } from 'react';
import type { SourcesFile } from '@sec/shared';

const COLOR: Record<string, string> = {
  closed: 'bg-emerald-500',
  'half-open': 'bg-yellow-400',
  open: 'bg-red-500',
};

export function SourceHealth({ sources }: { sources: SourcesFile }) {
  const entries = Object.entries(sources);
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;
  const healthy = entries.filter(([, h]) => h.state === 'closed').length;

  return (
    <footer className="border-t border-zinc-800 px-4 py-2">
      {/* Mobile: collapsed summary */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          className="text-xs uppercase tracking-wide text-[var(--color-muted)] min-h-[36px] flex items-center gap-2 hover:text-[var(--color-fg)]"
        >
          Source health: {healthy}/{entries.length} healthy {open ? '▾' : '▸'}
        </button>
        {open && (
          <ul className="mt-2 flex flex-col gap-1">
            {entries.map(([id, h]) => (
              <li key={id} className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <span className={`h-2 w-2 rounded-full ${COLOR[h.state] ?? 'bg-zinc-500'}`} />
                <span>{id}</span>
                {h.lastError && <span className="opacity-70">— {h.lastError}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desktop: full inline layout */}
      <div className="hidden md:flex flex-wrap items-center gap-3">
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
