'use client';
import { useEffect, useState } from 'react';
import type { IndexEntry } from '@sec/shared';

let cache: Promise<IndexEntry[]> | null = null;
// Resolved data kept alongside the promise so remounts (e.g. switching
// category routes) render synchronously with no skeleton flash.
let settled: IndexEntry[] | null = null;

function loadIndex(): Promise<IndexEntry[]> {
  if (!cache) {
    cache = fetch('/data/index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`index fetch failed: ${r.status}`);
        return r.json() as Promise<IndexEntry[]>;
      })
      .then((data) => {
        settled = data;
        return data;
      })
      .catch((e) => {
        cache = null; // allow retry on next mount
        throw e;
      });
  }
  return cache;
}

export function useVulnIndex(): { entries: IndexEntry[]; loading: boolean; error: string | null } {
  // Seed from the settled cache so a remount renders the full list immediately
  // instead of flashing the skeleton (or a partial/wrong count).
  const [entries, setEntries] = useState<IndexEntry[]>(() => settled ?? []);
  const [loading, setLoading] = useState(() => settled === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settled !== null) {
      setEntries(settled);
      setLoading(false);
      return;
    }
    let active = true;
    loadIndex()
      .then((e) => {
        if (active) {
          setEntries(e);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return { entries, loading, error };
}
