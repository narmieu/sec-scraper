'use client';
import { useState } from 'react';
import type { AlertedFile } from '@sec/shared';

export function AlertLog({ alerted }: { alerted: AlertedFile }) {
  const [open, setOpen] = useState(false);
  const week = Date.now() - 7 * 86_400_000;
  const recent = Object.entries(alerted)
    .filter(([, e]) => new Date(e.alertedAt).getTime() >= week)
    .sort(([, a], [, b]) => b.alertedAt.localeCompare(a.alertedAt));

  if (recent.length === 0) return null;

  return (
    <div className="border-t border-zinc-800 px-4 py-2">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="text-xs uppercase tracking-wide text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      >
        Alerts last 7d ({recent.length}) {open ? '▾' : '▸'}
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {recent.map(([id, e]) => (
            <li key={id} className="text-xs text-[var(--color-muted)]">
              <span className="font-mono">{id}</span> ·{' '}
              <span className="capitalize">{e.vulnSnapshot.severity}</span> · priority{' '}
              {e.vulnSnapshot.priority} ·{' '}
              <span>
                {Object.entries(e.channels)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(', ')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
