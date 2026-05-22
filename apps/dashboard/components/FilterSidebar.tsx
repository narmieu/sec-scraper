'use client';
import { SEVERITIES, ECOSYSTEMS, type Ecosystem, type Severity } from '@sec/shared';
import { useStore } from '../lib/store';

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function FilterSidebar() {
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const reset = useStore((s) => s.reset);

  return (
    <aside className="hidden w-56 shrink-0 border-r border-zinc-800 p-4 lg:block">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Severity
      </h3>
      <ul className="mb-4 space-y-1">
        {SEVERITIES.map((s) => (
          <li key={s}>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
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
            <label className="flex cursor-pointer items-center gap-2 text-sm">
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
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={filters.stackMatchOnly}
              onChange={(e) => setFilters({ stackMatchOnly: e.target.checked })}
            />
            <span>Stack match only</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={filters.kevOnly}
              onChange={(e) => setFilters({ kevOnly: e.target.checked })}
            />
            <span>KEV only (actively exploited)</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={filters.hideRead}
              onChange={(e) => setFilters({ hideRead: e.target.checked })}
            />
            <span>Hide read</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2">
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
        className="mt-4 rounded border border-zinc-700 px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      >
        Reset
      </button>
    </aside>
  );
}
