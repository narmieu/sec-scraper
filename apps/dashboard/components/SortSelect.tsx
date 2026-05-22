'use client';
import { SORT_OPTIONS, useStore } from '../lib/store';
import type { SortKey } from '../lib/store';

export function SortSelect() {
  const sort = useStore((s) => s.sort);
  const setSort = useStore((s) => s.setSort);

  return (
    <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
      <span>Sort</span>
      <select
        value={sort}
        onChange={(e) => setSort(e.target.value as SortKey)}
        className="rounded border border-zinc-700 bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
