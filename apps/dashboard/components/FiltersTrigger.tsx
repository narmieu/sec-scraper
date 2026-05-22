'use client';
import { useStore } from '../lib/store';

export function FiltersTrigger() {
  const setOpen = useStore((s) => s.setFiltersOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="lg:hidden rounded border border-zinc-700 px-3 py-2 text-sm min-h-[36px] text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
    >
      Filters
    </button>
  );
}
