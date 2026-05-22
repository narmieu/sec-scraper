import type { Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import { canonicalId, cleanText, deriveSeverity, toIsoDate } from '../pipeline/normalize.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

interface HactivityItem {
  id: string;
  attributes?: {
    title?: string;
    severity_rating?: string;
    latest_disclosable_action?: string;
    latest_disclosable_activity_at?: string;
    disclosed_at?: string;
    report_url?: string;
  };
  relationships?: {
    weakness?: { data?: { attributes?: { name?: string } } };
  };
}

export const hackeroneAiAdapter: Adapter = {
  id: 'hackerone-ai',
  cadence: '6h',

  async fetch(_cursor: SourceCursor): Promise<FetchResult> {
    // HackerOne hacktivity has no stable public REST. Best-effort fall back to the
    // hacktivity JSON sometimes exposed at /hacktivity.json. If unavailable, no-op.
    try {
      const data = await fetchJson<{ data?: HactivityItem[] }>(
        'https://hackerone.com/hacktivity.json?querystring=ai+llm+prompt&filter=type%3Apublic&page=1',
        { retries: 1, headers: { accept: 'application/json' } },
      );
      const items = (data.data ?? []).filter((i) => {
        const t = (i.attributes?.title ?? '').toLowerCase();
        return /ai|llm|prompt|jailbreak|injection|model/.test(t);
      });
      return { raw: items };
    } catch {
      return { raw: [] };
    }
  },

  normalize(raw: unknown): Vuln | null {
    const r = raw as HactivityItem | null;
    if (!r?.id) return null;
    const t = cleanText(r.attributes?.title ?? '');
    if (!t) return null;
    const severity = deriveSeverity({ ghsaSeverity: r.attributes?.severity_rating });
    const published = toIsoDate(r.attributes?.disclosed_at ?? r.attributes?.latest_disclosable_activity_at);
    const url = r.attributes?.report_url ?? `https://hackerone.com/reports/${r.id}`;

    return {
      id: canonicalId({ ghsaId: `H1-${r.id}`, title: t, publishedAt: published }),
      aliases: [`H1-${r.id}`],
      title: t,
      summary: cleanText(r.attributes?.latest_disclosable_action ?? t),
      severity,
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
          source: 'hackerone-ai',
          externalId: r.id,
          url,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags: ['ai-llm'],
    };
  },
};
