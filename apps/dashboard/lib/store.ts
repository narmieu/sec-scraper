'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Ecosystem, Severity } from '@sec/shared';

export interface Filters {
  severities: Severity[];
  ecosystems: Ecosystem[];
  sources: string[];
  stackMatchOnly: boolean;
  kevOnly: boolean;
  hideRead: boolean;
  showDismissed: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  severities: [],
  ecosystems: [],
  sources: [],
  stackMatchOnly: false,
  kevOnly: false,
  hideRead: false,
  showDismissed: false,
};

export type SortKey =
  | 'priority-desc'
  | 'priority-asc'
  | 'published-desc'
  | 'published-asc'
  | 'modified-desc'
  | 'severity-desc'
  | 'cvss-desc'
  | 'stackmatch-desc';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'priority-desc', label: 'Priority (high → low)' },
  { key: 'priority-asc', label: 'Priority (low → high)' },
  { key: 'published-desc', label: 'Newest published' },
  { key: 'published-asc', label: 'Oldest published' },
  { key: 'modified-desc', label: 'Recently modified' },
  { key: 'severity-desc', label: 'Severity (critical → low)' },
  { key: 'cvss-desc', label: 'CVSS (high → low)' },
  { key: 'stackmatch-desc', label: 'Stack match (high → low)' },
];

export const DEFAULT_SORT: SortKey = 'priority-desc';

interface State {
  readIds: string[];
  hiddenIds: string[];
  filters: Filters;
  query: string;
  sort: SortKey;
  markRead: (id: string) => void;
  unmarkRead: (id: string) => void;
  dismiss: (id: string) => void;
  setQuery: (q: string) => void;
  setFilters: (patch: Partial<Filters>) => void;
  setSort: (sort: SortKey) => void;
  reset: () => void;
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      readIds: [],
      hiddenIds: [],
      filters: DEFAULT_FILTERS,
      query: '',
      sort: DEFAULT_SORT,
      markRead: (id) =>
        set((s) => ({ readIds: s.readIds.includes(id) ? s.readIds : [...s.readIds, id] })),
      unmarkRead: (id) => set((s) => ({ readIds: s.readIds.filter((x) => x !== id) })),
      dismiss: (id) =>
        set((s) => ({ hiddenIds: s.hiddenIds.includes(id) ? s.hiddenIds : [...s.hiddenIds, id] })),
      setQuery: (query) => set({ query }),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      setSort: (sort) => set({ sort }),
      reset: () =>
        set({ readIds: [], hiddenIds: [], filters: DEFAULT_FILTERS, query: '', sort: DEFAULT_SORT }),
    }),
    { name: 'sec-scraper-store', version: 2 },
  ),
);
