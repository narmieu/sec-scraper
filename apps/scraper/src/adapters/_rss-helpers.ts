import type { Ecosystem, Tag, Vuln } from '@sec/shared';
import { canonicalId, cleanText, deriveSeverity, toIsoDate } from '../pipeline/normalize.js';
import type { RssItem } from '../pipeline/rss.js';

export interface RssVulnOpts {
  sourceId: string;
  ecosystems?: Ecosystem[];
  tags?: Tag[];
  severityFromTitle?: boolean;
}

export function rssItemToVuln(item: RssItem, opts: RssVulnOpts): Vuln | null {
  if (!item.title || !item.link) return null;
  const published = item.isoDate ?? item.pubDate;
  const body = cleanText(item.content || item.contentSnippet || item.summary || '');
  const title = cleanText(item.title);

  let severity: Vuln['severity'] = 'unknown';
  if (opts.severityFromTitle) {
    const t = title.toLowerCase();
    if (t.includes('critical')) severity = 'critical';
    else if (t.includes('high severity') || t.includes('severe')) severity = 'high';
    else if (t.includes('medium')) severity = 'medium';
    else if (t.includes('low')) severity = 'low';
  }
  if (severity === 'unknown') severity = deriveSeverity({});

  const id = canonicalId({
    title,
    publishedAt: toIsoDate(published),
  });

  const vuln: Vuln = {
    id,
    aliases: item.guid ? [item.guid] : [],
    title,
    summary: body.slice(0, 600),
    severity,
    ecosystems: opts.ecosystems ?? ['generic'],
    cwe: [],
    affected: [],
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0,
    kev: false,
    publishedAt: toIsoDate(published),
    modifiedAt: toIsoDate(published),
    mergedAt: new Date().toISOString(),
    sources: [
      {
        source: opts.sourceId,
        externalId: item.guid ?? item.link,
        url: item.link,
        fetchedAt: new Date().toISOString(),
      },
    ],
    tags: opts.tags ?? ['general'],
  };
  if (body) vuln.details = body;
  return vuln;
}
