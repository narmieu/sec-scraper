'use client';
import { useState } from 'react';
import type { SourceHealth as SourceHealthEntry, SourcesFile } from '@sec/shared';

type State = SourceHealthEntry['state'];

const DOT: Record<State, string> = {
  closed: 'bg-emerald-500',
  'half-open': 'bg-yellow-400',
  open: 'bg-red-500',
};

const LABEL: Record<State, string> = {
  closed: 'healthy',
  'half-open': 'recovering',
  open: 'failing',
};

interface Entry {
  id: string;
  state: State;
  lastError?: string;
}

function toEntries(sources: SourcesFile): Entry[] {
  return Object.entries(sources)
    .map(([id, h]): Entry => ({
      id,
      state: h.state,
      ...(h.lastError ? { lastError: h.lastError } : {}),
    }))
    .sort((a, b) => {
      const order = (s: State) => (s === 'open' ? 0 : s === 'half-open' ? 1 : 2);
      return order(a.state) - order(b.state) || a.id.localeCompare(b.id);
    });
}

export function SourceHealth({ sources }: { sources: SourcesFile }) {
  const [open, setOpen] = useState(false);
  const entries = toEntries(sources);
  if (entries.length === 0) return null;

  const issues = entries.filter((e) => e.state !== 'closed');
  const healthy = entries.length - issues.length;

  return (
    <footer className="border-t border-zinc-800 px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          className="flex items-center gap-2 min-h-[28px] text-[var(--color-muted)] hover:text-[var(--color-fg)] uppercase tracking-wide"
          aria-expanded={open}
        >
          <span>Source health</span>
          <span className="tabular-nums">
            {healthy}/{entries.length} healthy
          </span>
          <span aria-hidden>{open ? '▾' : '▸'}</span>
        </button>

        {issues.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {issues.map((e) => (
              <span
                key={e.id}
                title={e.lastError ? `${e.id}: ${e.lastError}` : `${e.id}: ${LABEL[e.state]}`}
                className="flex items-center gap-1.5 rounded border border-zinc-800 bg-[var(--color-surface)] px-1.5 py-0.5 text-[var(--color-fg)]"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${DOT[e.state]}`} />
                <span>{e.id}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {open && (
        <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 text-xs text-[var(--color-muted)]"
              title={e.lastError ? `${LABEL[e.state]} — ${e.lastError}` : LABEL[e.state]}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[e.state]}`} />
              <span className="truncate">{e.id}</span>
            </li>
          ))}
        </ul>
      )}
    </footer>
  );
}
