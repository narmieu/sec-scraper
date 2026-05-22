'use client';
import { useMemo } from 'react';
import type { Vuln } from '@sec/shared';
import { useStore } from '../lib/store';
import { search } from '../lib/search';
import { sortVulns } from '../lib/sort';
import { FilterSidebar } from './FilterSidebar';
import { SearchBar } from './SearchBar';
import { SortSelect } from './SortSelect';
import { VulnRow } from './VulnRow';

export function VulnListView({ vulns }: { vulns: Vuln[] }) {
  const filters = useStore((s) => s.filters);
  const query = useStore((s) => s.query);
  const sort = useStore((s) => s.sort);
  const readIds = useStore((s) => s.readIds);
  const hiddenIds = useStore((s) => s.hiddenIds);

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
      <FilterSidebar />
      <section className="flex-1 min-w-0">
        <div className="border-b border-zinc-800 px-4 py-3 space-y-2">
          <SearchBar />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--color-muted)]">
              {filtered.length} of {vulns.length} shown
            </span>
            <SortSelect />
          </div>
        </div>
        <div>
          {filtered.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-[var(--color-muted)]">
              No vulnerabilities match the current filters.
            </div>
          ) : (
            filtered.map((v) => <VulnRow key={v.id} vuln={v} />)
          )}
        </div>
      </section>
    </div>
  );
}
