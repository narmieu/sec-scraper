'use client';
import { useEffect, useState } from 'react';
import type { Vuln } from '@sec/shared';

// Module-level cache: id → in-flight or settled Promise<Vuln>
const cache = new Map<string, Promise<Vuln>>();

function loadVuln(id: string): Promise<Vuln> {
  if (!cache.has(id)) {
    const p = fetch(`/data/vuln/${encodeURIComponent(id)}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`vuln fetch failed: ${r.status}`);
        return r.json() as Promise<Vuln>;
      })
      .catch((e) => {
        cache.delete(id); // allow retry on next open
        throw e;
      });
    cache.set(id, p);
  }
  return cache.get(id)!;
}

export function useVulnDetail(id: string | null): {
  vuln: Vuln | null;
  loading: boolean;
  error: string | null;
} {
  const [vuln, setVuln] = useState<Vuln | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === null) {
      // Idle — reset to clean state
      setVuln(null);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setVuln(null);

    loadVuln(id)
      .then((v) => {
        if (active) {
          setVuln(v);
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
  }, [id]);

  return { vuln, loading, error };
}
