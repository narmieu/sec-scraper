'use client';
import { IconX } from '@tabler/icons-react';
import { useStore, DEFAULT_FILTERS } from '@/lib/store';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilters() {
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const setQuery = useStore((s) => s.setQuery);

  const chips: Chip[] = [];

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
        <Badge
          key={c.key}
          variant="outline"
          className="group inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] hover:border-ring hover:text-foreground"
        >
          <span className="truncate max-w-[160px]">{c.label}</span>
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Remove ${c.label}`}
            className={cn(
              'ml-0.5 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            )}
          >
            <IconX className="size-3" />
          </button>
        </Badge>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={clearAll}
          className="ml-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
