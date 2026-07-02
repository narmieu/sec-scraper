import type { Vuln } from '@sec/shared';
import { fetchJson } from '@/pipeline/fetch.js';
import { mapPool } from '@/pipeline/pool.js';
import type { EnrichResult, Enricher } from './types.js';

interface EpssResponse {
  data?: { cve: string; epss: string; percentile: string; date: string }[];
}

const BATCH_SIZE = 100;
const EPSS_CONCURRENCY = 6;

export const epssEnricher: Enricher = {
  id: 'epss',
  // EPSS scores are republished once a day, so hourly re-querying every CVE is
  // wasted work; the enricher cadence gate skips this on the other 23 runs.
  cadence: 'daily',

  async enrich(vulns: Vuln[]): Promise<EnrichResult> {
    const byCve = new Map<string, Vuln>();
    for (const v of vulns) {
      if (v.cveId && !byCve.has(v.cveId)) byCve.set(v.cveId, v);
    }
    const modifiedById = new Map<string, Partial<Vuln>>();
    if (byCve.size === 0) return { modifiedById };

    const cves = [...byCve.keys()];
    const batches: string[][] = [];
    for (let i = 0; i < cves.length; i += BATCH_SIZE) batches.push(cves.slice(i, i + BATCH_SIZE));

    // Batches are independent; run them pooled instead of one-at-a-time. Map
    // writes are safe — callbacks resolve one at a time on the single thread.
    await mapPool(batches, EPSS_CONCURRENCY, async (batch) => {
      try {
        const url = `https://api.first.org/data/v1/epss?cve=${batch.join(',')}`;
        const r = await fetchJson<EpssResponse>(url, { retries: 2 });
        for (const row of r.data ?? []) {
          const score = Number(row.epss);
          if (!Number.isFinite(score)) continue;
          const target = byCve.get(row.cve);
          if (!target) continue;
          modifiedById.set(target.id, { epss: score });
        }
      } catch {
        // best-effort enrichment
      }
    });

    return { modifiedById };
  },
};
