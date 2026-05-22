import type { Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import { canonicalId, cleanText, toIsoDate } from '../pipeline/normalize.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

interface AtlasCaseStudy {
  id?: string;
  name?: string;
  summary?: string;
  reported_date?: string;
  tactics?: string[];
}

const ATLAS_URL = 'https://atlas.mitre.org/api/v1/case-studies';

export const mitreAtlasAdapter: Adapter = {
  id: 'mitre-atlas',
  cadence: '6h',

  async fetch(_cursor: SourceCursor): Promise<FetchResult> {
    try {
      const data = await fetchJson<{ data?: AtlasCaseStudy[] } | AtlasCaseStudy[]>(ATLAS_URL, {
        retries: 2,
      });
      const items = Array.isArray(data) ? data : (data.data ?? []);
      return { raw: items };
    } catch {
      return { raw: [] };
    }
  },

  normalize(raw: unknown): Vuln | null {
    const r = raw as AtlasCaseStudy | null;
    if (!r?.id) return null;
    const published = toIsoDate(r.reported_date);

    return {
      id: canonicalId({ ghsaId: r.id }),
      aliases: [r.id],
      title: cleanText(r.name ?? r.id),
      summary: cleanText(r.summary ?? ''),
      severity: 'unknown',
      ecosystems: ['ai-llm'],
      cwe: [],
      affected: [],
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0,
      kev: false,
      publishedAt: published,
      modifiedAt: published,
      mergedAt: new Date().toISOString(),
      sources: [
        {
          source: 'mitre-atlas',
          externalId: r.id,
          url: `https://atlas.mitre.org/studies/${r.id}`,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags: ['ai-llm'],
    };
  },
};
