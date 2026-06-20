'use client';
import { useState } from 'react';
import type { SourceHealth as SourceHealthEntry, SourcesFile } from '@sec/shared';
import { IconPointFilled, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

type State = SourceHealthEntry['state'];

const DOT_COLOR: Record<State, string> = {
  closed: 'text-emerald-500',
  'half-open': 'text-yellow-400',
  open: 'text-red-500',
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
  const ChevronIcon = open ? IconChevronDown : IconChevronRight;

  return (
    <footer className="border-t border-border px-4 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          className="flex items-center gap-1.5 min-h-[28px] text-muted-foreground hover:text-foreground uppercase tracking-wide transition-colors"
          aria-expanded={open}
        >
          <ChevronIcon size={12} className="shrink-0" />
          <span>Source health</span>
          <span className="tabular-nums">
            {healthy}/{entries.length} healthy
          </span>
        </button>

        {issues.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {issues.map((e) => (
              <span
                key={e.id}
                title={e.lastError ? `${e.id}: ${e.lastError}` : `${e.id}: ${LABEL[e.state]}`}
                className="flex items-center gap-1.5 rounded border border-border bg-card px-1.5 py-0.5 text-card-foreground"
              >
                <IconPointFilled
                  size={8}
                  className={cn('shrink-0', DOT_COLOR[e.state])}
                />
                <span>{e.id}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {open && (
        <Card className="mt-3 py-3 gap-3 rounded-lg border-border bg-card/50">
          <CardContent className="px-4 py-0">
            <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  title={e.lastError ? `${LABEL[e.state]} — ${e.lastError}` : LABEL[e.state]}
                >
                  <IconPointFilled
                    size={8}
                    className={cn('shrink-0', DOT_COLOR[e.state])}
                  />
                  <span className="truncate">{e.id}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </footer>
  );
}
