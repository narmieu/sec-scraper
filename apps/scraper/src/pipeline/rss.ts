import Parser from 'rss-parser';
import { fetchText } from './fetch.js';

const parser = new Parser({
  timeout: 20_000,
  customFields: {
    item: ['content:encoded', 'content', 'summary'],
  },
});

export interface RssItem {
  title: string;
  link: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
  categories?: string[];
  guid?: string;
}

export async function fetchRss(url: string): Promise<RssItem[]> {
  const raw = await fetchText(url, { retries: 2 });
  const feed = await parser.parseString(raw);
  return feed.items as RssItem[];
}

const MAX_AGE_DAYS = 14;

export function isRecent(isoDate: string | undefined, maxDays = MAX_AGE_DAYS): boolean {
  if (!isoDate) return true;
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t < maxDays * 86_400_000;
}
