import * as cheerio from 'cheerio';
import type { Vuln } from '@sec/shared';
import { fetchText } from '../pipeline/fetch.js';
import { canonicalId, cleanText, toIsoDate } from '../pipeline/normalize.js';
import { isRecent } from '../pipeline/rss.js';

export interface ScrapeRow {
  title: string;
  url: string;
  publishedAt?: string;
  summary?: string;
}

export async function scrapeHtmlList(
  pageUrl: string,
  pickRows: ($: cheerio.CheerioAPI) => ScrapeRow[],
): Promise<ScrapeRow[]> {
  try {
    const html = await fetchText(pageUrl, { retries: 2 });
    const $ = cheerio.load(html);
    return pickRows($).filter((r) => isRecent(r.publishedAt));
  } catch {
    return [];
  }
}

export function htmlRowToVuln(row: ScrapeRow, sourceId: string, baseUrl: string): Vuln {
  const url = row.url.startsWith('http') ? row.url : new URL(row.url, baseUrl).toString();
  const title = cleanText(row.title);
  return {
    id: canonicalId({ title, publishedAt: row.publishedAt }),
    aliases: [],
    title,
    summary: cleanText(row.summary ?? title),
    severity: 'unknown',
    ecosystems: ['ai-llm'],
    cwe: [],
    affected: [],
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0,
    kev: false,
    publishedAt: toIsoDate(row.publishedAt),
    modifiedAt: toIsoDate(row.publishedAt),
    mergedAt: new Date().toISOString(),
    sources: [
      {
        source: sourceId,
        externalId: url,
        url,
        fetchedAt: new Date().toISOString(),
      },
    ],
    tags: ['ai-llm'],
  };
}
