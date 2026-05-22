'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Ecosystem, Severity } from '@sec/shared';

export interface Filters {
  severities: Severity[];
  ecosystems: Ecosystem[];
  sources: string[];
  stackMatchOnly: boolean;
  hideRead: boolean;
  showDismissed: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  severities: [],
  ecosystems: [],
  sources: [],
  stackMatchOnly: false,
  hideRead: false,
  showDismissed: false,
};

interface State {
  readIds: string[];
  hiddenIds: string[];
  filters: Filters;
  query: string;
  markRead: (id: string) => void;
  unmarkRead: (id: string) => void;
  dismiss: (id: string) => void;
  setQuery: (q: string) => void;
  setFilters: (patch: Partial<Filters>) => void;
  reset: () => void;
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      readIds: [],
      hiddenIds: [],
      filters: DEFAULT_FILTERS,
      query: '',
      markRead: (id) =>
        set((s) => ({ readIds: s.readIds.includes(id) ? s.readIds : [...s.readIds, id] })),
      unmarkRead: (id) => set((s) => ({ readIds: s.readIds.filter((x) => x !== id) })),
      dismiss: (id) =>
        set((s) => ({ hiddenIds: s.hiddenIds.includes(id) ? s.hiddenIds : [...s.hiddenIds, id] })),
      setQuery: (query) => set({ query }),
      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      reset: () =>
        set({ readIds: [], hiddenIds: [], filters: DEFAULT_FILTERS, query: '' }),
    }),
    { name: 'sec-scraper-store', version: 1 },
  ),
);
