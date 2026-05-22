import type { Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import { canonicalId, cleanText, toIsoDate } from '../pipeline/normalize.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

interface AvidEntry {
  uuid?: string;
  metadata?: {
    vuln_id?: string;
    description?: string;
    risk?: string;
    published_at?: string;
  };
  affects?: { developer?: string[]; deployment?: string[]; artifacts?: string[] };
}

const AVID_FEED = 'https://avidml.org/api/vulnerabilities.json';

export const avidAdapter: Adapter = {
  id: 'avid',
  cadence: '6h',

  async fetch(_cursor: SourceCursor): Promise<FetchResult> {
    try {
      const data = await fetchJson<{ items?: AvidEntry[] } | AvidEntry[]>(AVID_FEED, {
        retries: 2,
      });
      const items = Array.isArray(data) ? data : (data.items ?? []);
      return { raw: items };
    } catch {
      return { raw: [] };
    }
  },

  normalize(raw: unknown): Vuln | null {
    const r = raw as AvidEntry | null;
    if (!r) return null;
    const id = r.metadata?.vuln_id ?? r.uuid;
    if (!id) return null;
    const desc = cleanText(r.metadata?.description ?? '');
    const published = toIsoDate(r.metadata?.published_at);

    return {
      id: canonicalId({ ghsaId: id }),
      aliases: [id],
      title: cleanText(desc.slice(0, 200) || `AVID ${id}`),
      summary: desc,
      severity: r.metadata?.risk === 'high' ? 'high' : 'unknown',
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
          source: 'avid',
          externalId: id,
          url: `https://avidml.org/database/${id}`,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags: ['ai-llm'],
    };
  },
};
