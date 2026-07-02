import Parser from 'rss-parser';
import { fetchTextIfModified, NOT_MODIFIED, type FetchOpts } from './fetch.js';

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

/** Fetches and parses a feed. When `ifModifiedSince` is supplied and the server
 *  answers 304, returns [] without downloading or parsing the body — cheap way
 *  to skip unchanged feeds on the hourly run. */
export async function fetchRss(url: string, ifModifiedSince?: string): Promise<RssItem[]> {
  const opts: FetchOpts = { retries: 2 };
  if (ifModifiedSince) opts.ifModifiedSince = ifModifiedSince;
  const res = await fetchTextIfModified(url, opts);
  if (res === NOT_MODIFIED) return [];
  const feed = await parser.parseString(res);
  return feed.items as RssItem[];
}

const MAX_AGE_DAYS = 14;

export function isRecent(isoDate: string | undefined, maxDays = MAX_AGE_DAYS): boolean {
  if (!isoDate) return true;
  const t = new Date(isoDate).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t < maxDays * 86_400_000;
}
