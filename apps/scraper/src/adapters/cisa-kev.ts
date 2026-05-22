import type { Tag, Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import { canonicalId, cleanText, toIsoDate } from '../pipeline/normalize.js';
import type { EnrichResult, Enricher } from './types.js';

interface KevResponse {
  vulnerabilities?: KevEntry[];
}

interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction?: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
}

const KEV_URL = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

export const kevEnricher: Enricher = {
  id: 'cisa-kev',
  cadence: 'hourly',

  async enrich(vulns: Vuln[]): Promise<EnrichResult> {
    const modifiedById = new Map<string, Partial<Vuln>>();
    const addedVulns: Vuln[] = [];

    let data: KevResponse;
    try {
      data = await fetchJson<KevResponse>(KEV_URL, { retries: 2 });
    } catch {
      return { modifiedById };
    }

    const entries = data.vulnerabilities ?? [];
    const existingByCve = new Map<string, Vuln>();
    for (const v of vulns) {
      if (v.cveId) existingByCve.set(v.cveId, v);
    }

    for (const entry of entries) {
      const existing = existingByCve.get(entry.cveID);
      if (existing) {
        const tags: Tag[] = [...new Set<Tag>([...existing.tags, 'exploited'])];
        modifiedById.set(existing.id, { kev: true, tags });
      } else {
        const synthetic: Vuln = {
          id: canonicalId({ cveId: entry.cveID }),
          cveId: entry.cveID,
          aliases: [entry.cveID],
          title: cleanText(entry.vulnerabilityName || entry.cveID),
          summary: cleanText(entry.shortDescription || ''),
          severity: 'high',
          ecosystems: ['infrastructure'],
          cwe: [],
          affected: [],
          stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
          priority: 0,
          kev: true,
          publishedAt: toIsoDate(entry.dateAdded),
          modifiedAt: toIsoDate(entry.dateAdded),
          mergedAt: new Date().toISOString(),
          sources: [
            {
              source: 'cisa-kev',
              externalId: entry.cveID,
              url: `https://nvd.nist.gov/vuln/detail/${entry.cveID}`,
              fetchedAt: new Date().toISOString(),
            },
          ],
          tags: ['exploited'],
        };
        addedVulns.push(synthetic);
      }
    }

    return { modifiedById, addedVulns };
  },
};
