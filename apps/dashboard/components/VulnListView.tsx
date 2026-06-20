'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { IndexEntry, SourcesFile } from '@sec/shared';
import { useStore } from '@/lib/store';
import { useVulnIndex } from '@/lib/useVulnIndex';
import { useVulnParam } from '@/lib/useVulnParam';
import { search } from '@/lib/search';
import { sortVulns } from '@/lib/sort';
import { CATEGORY_PREDICATES, type Category } from '@/lib/categories';
import { FilterSidebar, type SourceOption } from '@/components/FilterSidebar';
import { ActiveFilters } from '@/components/ActiveFilters';
import { SearchBar } from '@/components/SearchBar';
import { SortSelect } from '@/components/SortSelect';
import { VulnRow } from '@/components/VulnRow';
import { Pagination } from '@/components/Pagination';
import { Skeleton } from '@/components/ui/skeleton';

const PAGE_SIZE = 50;

export function VulnListView({ sources, category }: { sources: SourcesFile; category?: Category }) {
  const { entries, loading, error } = useVulnIndex();
  const filters = useStore((s) => s.filters);
  const query = useStore((s) => s.query);
  const sort = useStore((s) => s.sort);
  const readIds = useStore((s) => s.readIds);
  const hiddenIds = useStore((s) => s.hiddenIds);
  const markRead = useStore((s) => s.markRead);
  const unmarkRead = useStore((s) => s.unmarkRead);
  const dismiss = useStore((s) => s.dismiss);
  const reset = useStore((s) => s.reset);
  const { openVuln } = useVulnParam();
  const [page, setPage] = useState(1);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const goToPage = (p: number) => {
    setPage(p);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };

  const scoped = useMemo(() => {
    const pred = category ? CATEGORY_PREDICATES[category] : null;
    return pred ? entries.filter(pred) : entries;
  }, [entries, category]);

  const sourceOptions = useMemo<SourceOption[]>(() => {
    const counts = new Map<string, number>();
    for (const v of scoped) for (const s of v.sources) counts.set(s, (counts.get(s) ?? 0) + 1);
    const ids = new Set<string>([...counts.keys(), ...Object.keys(sources)]);
    return [...ids]
      .map((id) => ({
        id,
        count: counts.get(id) ?? 0,
        state: (sources[id]?.state ?? 'closed') as SourceOption['state'],
      }))
      .sort((a, b) => {
        const aIssue = a.state !== 'closed' ? 1 : 0;
        const bIssue = b.state !== 'closed' ? 1 : 0;
        if (aIssue !== bIssue) return bIssue - aIssue;
        if (b.count !== a.count) return b.count - a.count;
        return a.id.localeCompare(b.id);
      });
  }, [scoped, sources]);

  const filtered = useMemo(() => {
    let out: IndexEntry[] = scoped;
    if (filters.severities.length > 0) out = out.filter((v) => filters.severities.includes(v.severity));
    if (filters.ecosystems.length > 0)
      out = out.filter((v) => v.ecosystems.some((e) => filters.ecosystems.includes(e)));
    if (filters.sources.length > 0) out = out.filter((v) => v.sources.some((s) => filters.sources.includes(s)));
    if (filters.stackMatchOnly) out = out.filter((v) => v.stackMatch.score > 0);
    if (filters.kevOnly) out = out.filter((v) => v.kev);
    if (filters.affectedOnly) out = out.filter((v) => v.exposure?.status === 'affected');
    if (filters.hideRead) out = out.filter((v) => !readIds.includes(v.id));
    if (!filters.showDismissed) out = out.filter((v) => !hiddenIds.includes(v.id));
    if (filters.hasExploit) out = out.filter((v) => v.exploitMaturity != null && v.exploitMaturity !== 'none');
    if (filters.noPatch) out = out.filter((v) => !v.patchAvailable);
    if (query) out = search(out, query);
    return sortVulns(out, sort);
  }, [scoped, filters, query, sort, readIds, hiddenIds]);

  useEffect(() => {
    setPage(1);
    setActiveIndex(-1);
  }, [filters, query, sort, category]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setActiveIndex(-1);
  }, [safePage]);

  // Keyboard triage: j/k or ↑/↓ move, Enter/o open, e toggle read, x dismiss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'BUTTON' ||
        t.tagName === 'A' ||
        t.isContentEditable
      ) {
        return; // user is in a field or on a control — don't intercept
      }
      // Don't steal keys while a modal / drawer / sheet is open.
      if (
        document.querySelector(
          '[data-slot="dialog-content"],[data-slot="drawer-content"],[data-slot="sheet-content"]',
        )
      ) {
        return;
      }
      const n = pageItems.length;
      if (n === 0) return;
      const cur = activeIndex >= 0 ? pageItems[activeIndex] : undefined;
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => Math.min(n - 1, i + 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => (i <= 0 ? 0 : i - 1));
          break;
        case 'Enter':
        case 'o':
          if (cur) {
            e.preventDefault();
            openVuln(cur.id);
          }
          break;
        case 'e':
          if (cur) {
            e.preventDefault();
            if (readIds.includes(cur.id)) unmarkRead(cur.id);
            else markRead(cur.id);
          }
          break;
        case 'x':
          if (cur) {
            e.preventDefault();
            dismiss(cur.id);
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pageItems, activeIndex, readIds, markRead, unmarkRead, dismiss, openVuln]);

  // Keep the active row in view as you move through the list.
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listRef.current?.querySelector(`[data-row-index="${activeIndex}"]`);
    (el as HTMLElement | null)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div className="flex">
      <FilterSidebar sourceOptions={sourceOptions} />
      <section className="flex-1 min-w-0">
        <div className="sticky top-12 z-20 space-y-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
          <SearchBar />
          <ActiveFilters />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtered.length === 0
                ? '0 results'
                : `${((safePage - 1) * PAGE_SIZE + 1).toLocaleString()}–${Math.min(
                    safePage * PAGE_SIZE,
                    filtered.length,
                  ).toLocaleString()} of ${filtered.length.toLocaleString()}`}
            </span>
            <SortSelect />
          </div>
        </div>
        <div>
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <div className="px-4 py-16 text-center text-sm text-muted-foreground">
              Failed to load data ({error}).
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center text-sm text-muted-foreground">
              <p>No vulnerabilities match the current filters.</p>
              <button
                type="button"
                onClick={reset}
                className="rounded border border-zinc-700 px-3 py-2 text-xs text-foreground hover:bg-accent"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              <div ref={listRef}>
                {pageItems.map((v, i) => (
                  <VulnRow
                    key={v.id}
                    vuln={v}
                    index={i}
                    active={i === activeIndex}
                    onActivate={setActiveIndex}
                  />
                ))}
              </div>
              <Pagination page={safePage} pageCount={pageCount} total={filtered.length} onPage={goToPage} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3 rounded" />
            <Skeleton className="h-4 w-2/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
