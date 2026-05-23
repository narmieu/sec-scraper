'use client';
import { useStore, DEFAULT_FILTERS } from '@/lib/store';

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilters() {
  const filters = useStore((s) => s.filters);
  const query = useStore((s) => s.query);
  const setFilters = useStore((s) => s.setFilters);
  const setQuery = useStore((s) => s.setQuery);

  const chips: Chip[] = [];

  if (query) {
    chips.push({
      key: 'query',
      label: `"${query}"`,
      onRemove: () => setQuery(''),
    });
  }
  for (const s of filters.severities) {
    chips.push({
      key: `sev:${s}`,
      label: s,
      onRemove: () => setFilters({ severities: filters.severities.filter((x) => x !== s) }),
    });
  }
  for (const e of filters.ecosystems) {
    chips.push({
      key: `eco:${e}`,
      label: e,
      onRemove: () => setFilters({ ecosystems: filters.ecosystems.filter((x) => x !== e) }),
    });
  }
  for (const src of filters.sources) {
    chips.push({
      key: `src:${src}`,
      label: src,
      onRemove: () => setFilters({ sources: filters.sources.filter((x) => x !== src) }),
    });
  }
  if (filters.stackMatchOnly) {
    chips.push({
      key: 'stack',
      label: 'stack match',
      onRemove: () => setFilters({ stackMatchOnly: false }),
    });
  }
  if (filters.kevOnly) {
    chips.push({
      key: 'kev',
      label: 'KEV',
      onRemove: () => setFilters({ kevOnly: false }),
    });
  }
  if (filters.hideRead) {
    chips.push({
      key: 'hideRead',
      label: 'hide read',
      onRemove: () => setFilters({ hideRead: false }),
    });
  }
  if (filters.showDismissed) {
    chips.push({
      key: 'showDismissed',
      label: 'show dismissed',
      onRemove: () => setFilters({ showDismissed: false }),
    });
  }

  if (chips.length === 0) return null;

  const clearAll = () => {
    setFilters(DEFAULT_FILTERS);
    setQuery('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className="group inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-[var(--color-surface)] px-2 py-0.5 text-[11px] text-[var(--color-fg)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          title={`Remove ${c.label}`}
        >
          <span className="truncate max-w-[160px]">{c.label}</span>
          <span aria-hidden className="text-[var(--color-muted)] group-hover:text-[var(--color-accent)]">×</span>
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-1 rounded-full px-2 py-0.5 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
