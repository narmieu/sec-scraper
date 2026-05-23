import type { Vuln } from '@sec/shared';
import { fetchJson } from '@/pipeline/fetch.js';
import type { EnrichResult, Enricher } from './types.js';

interface EpssResponse {
  data?: { cve: string; epss: string; percentile: string; date: string }[];
}

const BATCH_SIZE = 100;

export const epssEnricher: Enricher = {
  id: 'epss',
  cadence: 'hourly',

  async enrich(vulns: Vuln[]): Promise<EnrichResult> {
    const byCve = new Map<string, Vuln>();
    for (const v of vulns) {
      if (v.cveId && !byCve.has(v.cveId)) byCve.set(v.cveId, v);
    }
    const modifiedById = new Map<string, Partial<Vuln>>();
    if (byCve.size === 0) return { modifiedById };

    const cves = [...byCve.keys()];
    for (let i = 0; i < cves.length; i += BATCH_SIZE) {
      const batch = cves.slice(i, i + BATCH_SIZE);
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
    }

    return { modifiedById };
  },
};
