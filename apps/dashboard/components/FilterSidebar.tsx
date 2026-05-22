'use client';
import { useEffect, useRef } from 'react';
import { SEVERITIES, ECOSYSTEMS, type Ecosystem, type Severity } from '@sec/shared';
import { useStore } from '../lib/store';

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function FilterSidebar() {
  const open = useStore((s) => s.filtersOpen);
  const setOpen = useStore((s) => s.setFiltersOpen);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Body scroll lock while drawer is open
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, [open]);

  // Esc-to-close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Move focus to Close button when drawer opens
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  return (
    <>
      {/* Inline aside on lg+ */}
      <aside className="hidden lg:block w-56 shrink-0 border-r border-zinc-800 p-4">
        <FilterPanel />
      </aside>

      {/* Drawer + backdrop on <lg */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[var(--color-bg)] border-r border-zinc-800 p-4 overflow-y-auto"
            role="dialog"
            aria-label="Filters"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Filters</h2>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-zinc-700 px-3 py-2 text-sm min-h-[36px] text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
              >
                Close
              </button>
            </div>
            <FilterPanel />
          </aside>
        </div>
      )}
    </>
  );
}

function FilterPanel() {
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const reset = useStore((s) => s.reset);

  return (
    <>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Severity
      </h3>
      <ul className="mb-4 space-y-1">
        {SEVERITIES.map((s) => (
          <li key={s}>
            <label className="flex cursor-pointer items-center gap-2 text-sm py-1">
              <input
                type="checkbox"
                checked={filters.severities.includes(s)}
                onChange={() =>
                  setFilters({ severities: toggle(filters.severities, s as Severity) })
                }
              />
              <span className="capitalize">{s}</span>
            </label>
          </li>
        ))}
      </ul>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Ecosystem
      </h3>
      <ul className="mb-4 space-y-1">
        {ECOSYSTEMS.map((e) => (
          <li key={e}>
            <label className="flex cursor-pointer items-center gap-2 text-sm py-1">
              <input
                type="checkbox"
                checked={filters.ecosystems.includes(e)}
                onChange={() =>
                  setFilters({ ecosystems: toggle(filters.ecosystems, e as Ecosystem) })
                }
              />
              <span>{e}</span>
            </label>
          </li>
        ))}
      </ul>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Display
      </h3>
      <ul className="space-y-1 text-sm">
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={filters.stackMatchOnly}
              onChange={(e) => setFilters({ stackMatchOnly: e.target.checked })}
            />
            <span>Stack match only</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={filters.kevOnly}
              onChange={(e) => setFilters({ kevOnly: e.target.checked })}
            />
            <span>KEV only (actively exploited)</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={filters.hideRead}
              onChange={(e) => setFilters({ hideRead: e.target.checked })}
            />
            <span>Hide read</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={filters.showDismissed}
              onChange={(e) => setFilters({ showDismissed: e.target.checked })}
            />
            <span>Show dismissed</span>
          </label>
        </li>
      </ul>

      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded border border-zinc-700 px-3 py-2 text-xs min-h-[36px] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      >
        Reset
      </button>
    </>
  );
}
