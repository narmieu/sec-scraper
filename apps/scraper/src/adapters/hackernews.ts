import type { Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import { canonicalId, cleanText, toIsoDate } from '../pipeline/normalize.js';
import { isRecent } from '../pipeline/rss.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

interface AlgoliaHit {
  objectID: string;
  title?: string;
  story_text?: string;
  url?: string;
  created_at: string;
  _tags?: string[];
}

interface AlgoliaResponse {
  hits?: AlgoliaHit[];
}

const QUERY_URL =
  'https://hn.algolia.com/api/v1/search_by_date?query=vulnerability+OR+CVE+OR+exploit&tags=story&hitsPerPage=50';

export const hackernewsAdapter: Adapter = {
  id: 'hackernews',
  cadence: 'hourly',

  async fetch(_cursor: SourceCursor): Promise<FetchResult> {
    const data = await fetchJson<AlgoliaResponse>(QUERY_URL);
    const hits = (data.hits ?? []).filter((h) => isRecent(h.created_at));
    return { raw: hits };
  },

  normalize(raw: unknown): Vuln | null {
    const r = raw as AlgoliaHit | null;
    if (!r || !r.title) return null;
    const title = cleanText(r.title);
    const t = title.toLowerCase();
    let severity: Vuln['severity'] = 'unknown';
    if (t.includes('critical')) severity = 'critical';
    else if (t.includes('high severity') || t.includes('severe')) severity = 'high';

    return {
      id: canonicalId({ title, publishedAt: r.created_at }),
      aliases: [r.objectID],
      title,
      summary: cleanText(r.story_text ?? ''),
      severity,
      ecosystems: ['generic'],
      cwe: [],
      affected: [],
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0,
      kev: false,
      publishedAt: toIsoDate(r.created_at),
      modifiedAt: toIsoDate(r.created_at),
      mergedAt: new Date().toISOString(),
      sources: [
        {
          source: 'hackernews',
          externalId: r.objectID,
          url: r.url ?? `https://news.ycombinator.com/item?id=${r.objectID}`,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags: ['general'],
    };
  },
};
