'use client';
import { useMemo } from 'react';
import type { SourcesFile, Vuln } from '@sec/shared';
import { useStore } from '@/lib/store';
import { search } from '@/lib/search';
import { sortVulns } from '@/lib/sort';
import { FilterSidebar, type SourceOption } from '@/components/FilterSidebar';
import { ActiveFilters } from '@/components/ActiveFilters';
import { SearchBar } from '@/components/SearchBar';
import { SortSelect } from '@/components/SortSelect';
import { VulnRow } from '@/components/VulnRow';

export function VulnListView({ vulns, sources }: { vulns: Vuln[]; sources: SourcesFile }) {
  const filters = useStore((s) => s.filters);
  const query = useStore((s) => s.query);
  const sort = useStore((s) => s.sort);
  const readIds = useStore((s) => s.readIds);
  const hiddenIds = useStore((s) => s.hiddenIds);
  const reset = useStore((s) => s.reset);

  const sourceOptions = useMemo<SourceOption[]>(() => {
    const counts = new Map<string, number>();
    for (const v of vulns) {
      for (const s of v.sources) counts.set(s.source, (counts.get(s.source) ?? 0) + 1);
    }
    const ids = new Set<string>([...counts.keys(), ...Object.keys(sources)]);
    return [...ids]
      .map((id) => ({
        id,
        count: counts.get(id) ?? 0,
        state: (sources[id]?.state ?? 'closed') as SourceOption['state'],
      }))
      .sort((a, b) => {
        // Issues first, then by count desc
        const aIssue = a.state !== 'closed' ? 1 : 0;
        const bIssue = b.state !== 'closed' ? 1 : 0;
        if (aIssue !== bIssue) return bIssue - aIssue;
        if (b.count !== a.count) return b.count - a.count;
        return a.id.localeCompare(b.id);
      });
  }, [vulns, sources]);

  const filtered = useMemo(() => {
    let out = vulns;
    if (filters.severities.length > 0) {
      out = out.filter((v) => filters.severities.includes(v.severity));
    }
    if (filters.ecosystems.length > 0) {
      out = out.filter((v) => v.ecosystems.some((e) => filters.ecosystems.includes(e)));
    }
    if (filters.sources.length > 0) {
      out = out.filter((v) => v.sources.some((s) => filters.sources.includes(s.source)));
    }
    if (filters.stackMatchOnly) {
      out = out.filter((v) => v.stackMatch.score > 0);
    }
    if (filters.kevOnly) {
      out = out.filter((v) => v.kev);
    }
    if (filters.hideRead) {
      out = out.filter((v) => !readIds.includes(v.id));
    }
    if (!filters.showDismissed) {
      out = out.filter((v) => !hiddenIds.includes(v.id));
    }
    if (query) out = search(out, query);
    return sortVulns(out, sort);
  }, [vulns, filters, query, sort, readIds, hiddenIds]);

  return (
    <div className="flex">
      <FilterSidebar sourceOptions={sourceOptions} />
      <section className="flex-1 min-w-0">
        <div className="border-b border-zinc-800 px-4 py-3 space-y-3">
          <SearchBar />
          <ActiveFilters />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--color-muted)] tabular-nums">
              {filtered.length} of {vulns.length} shown
            </span>
            <SortSelect />
          </div>
        </div>
        <div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center text-sm text-[var(--color-muted)]">
              <p>No vulnerabilities match the current filters.</p>
              <button
                type="button"
                onClick={reset}
                className="rounded border border-zinc-700 px-3 py-2 text-xs text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
              >
                Clear filters
              </button>
            </div>
          ) : (
            filtered.map((v) => <VulnRow key={v.id} vuln={v} />)
          )}
        </div>
      </section>
    </div>
  );
}
