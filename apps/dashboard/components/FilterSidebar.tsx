'use client';
import { useEffect, useRef } from 'react';
import { SEVERITIES, ECOSYSTEMS, type Ecosystem, type Severity } from '@sec/shared';
import { useStore } from '@/lib/store';

export interface SourceOption {
  id: string;
  count: number;
  state: 'closed' | 'open' | 'half-open';
}

const STATE_DOT: Record<SourceOption['state'], string> = {
  closed: 'bg-emerald-500',
  'half-open': 'bg-yellow-400',
  open: 'bg-red-500',
};

const STATE_TITLE: Record<SourceOption['state'], string> = {
  closed: 'healthy',
  'half-open': 'recovering',
  open: 'failing',
};

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function FilterSidebar({ sourceOptions }: { sourceOptions: SourceOption[] }) {
  const open = useStore((s) => s.filtersOpen);
  const setOpen = useStore((s) => s.setFiltersOpen);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  return (
    <>
      <aside className="hidden lg:block w-60 shrink-0 border-r border-zinc-800 p-4 overflow-y-auto sticky top-[57px] self-start max-h-[calc(100vh-57px)] scrollbar-fade">
        <FilterPanel sourceOptions={sourceOptions} />
      </aside>

      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[var(--color-bg)] border-r border-zinc-800 p-4 overflow-y-auto scrollbar-slim"
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
            <FilterPanel sourceOptions={sourceOptions} />
          </aside>
        </div>
      )}
    </>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
      {children}
    </h3>
  );
}

function FilterPanel({ sourceOptions }: { sourceOptions: SourceOption[] }) {
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const reset = useStore((s) => s.reset);

  return (
    <>
      <SectionHeading>Severity</SectionHeading>
      <ul className="mb-5 space-y-0.5">
        {SEVERITIES.map((s) => (
          <li key={s}>
            <label className="flex cursor-pointer items-center gap-2 text-sm py-1 hover:text-[var(--color-fg)]">
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

      <SectionHeading>Ecosystem</SectionHeading>
      <ul className="mb-5 space-y-0.5">
        {ECOSYSTEMS.map((e) => (
          <li key={e}>
            <label className="flex cursor-pointer items-center gap-2 text-sm py-1 hover:text-[var(--color-fg)]">
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

      <SectionHeading>Display</SectionHeading>
      <ul className="mb-5 space-y-0.5 text-sm">
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1 hover:text-[var(--color-fg)]">
            <input
              type="checkbox"
              checked={filters.stackMatchOnly}
              onChange={(e) => setFilters({ stackMatchOnly: e.target.checked })}
            />
            <span>Stack match only</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1 hover:text-[var(--color-fg)]">
            <input
              type="checkbox"
              checked={filters.kevOnly}
              onChange={(e) => setFilters({ kevOnly: e.target.checked })}
            />
            <span>KEV only (actively exploited)</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1 hover:text-[var(--color-fg)]">
            <input
              type="checkbox"
              checked={filters.hideRead}
              onChange={(e) => setFilters({ hideRead: e.target.checked })}
            />
            <span>Hide read</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1 hover:text-[var(--color-fg)]">
            <input
              type="checkbox"
              checked={filters.showDismissed}
              onChange={(e) => setFilters({ showDismissed: e.target.checked })}
            />
            <span>Show dismissed</span>
          </label>
        </li>
      </ul>

      {sourceOptions.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <SectionHeading>Sources</SectionHeading>
            {filters.sources.length > 0 && (
              <button
                type="button"
                onClick={() => setFilters({ sources: [] })}
                className="mb-2 text-[10px] uppercase tracking-wide text-[var(--color-muted)] hover:text-[var(--color-fg)]"
              >
                clear
              </button>
            )}
          </div>
          <ul className="mb-5 max-h-72 overflow-y-auto pr-1 space-y-0.5 scrollbar-slim">
            {sourceOptions.map((s) => {
              const active = filters.sources.includes(s.id);
              return (
                <li key={s.id}>
                  <label className="flex cursor-pointer items-center gap-2 py-1 text-sm hover:text-[var(--color-fg)]">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => setFilters({ sources: toggle(filters.sources, s.id) })}
                    />
                    <span
                      title={STATE_TITLE[s.state]}
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[s.state]}`}
                    />
                    <span className="truncate flex-1">{s.id}</span>
                    <span className="text-[10px] tabular-nums text-[var(--color-muted)]">
                      {s.count}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded border border-zinc-700 px-3 py-2 text-xs min-h-[36px] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      >
        Reset all
      </button>
    </>
  );
}
