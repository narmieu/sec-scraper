import type { Cadence, Ecosystem, Tag, Vuln } from '@sec/shared';
import { fetchRss, isRecent, type RssItem } from '../pipeline/rss.js';
import { conditionalSince } from '../pipeline/fetch.js';
import type { Adapter, FetchResult, SourceCursor, SourceKind } from './types.js';
import { rssItemToVuln } from './_rss-helpers.js';

// Overlap window for If-Modified-Since so items published right around the last
// fetch aren't dropped by a coarse server-side comparison.
const IF_MODIFIED_MARGIN_MS = 30 * 60_000;

export interface MakeRssAdapterOpts {
  id: string;
  kind: SourceKind;
  cadence?: Cadence;
  url: string;
  ecosystems?: Ecosystem[];
  tags?: Tag[];
  severityFromTitle?: boolean;
  filter?: (item: RssItem) => boolean;
  maxAgeDays?: number;
}

export function makeRssAdapter(opts: MakeRssAdapterOpts): Adapter {
  const { id, kind, cadence = 'hourly', url, maxAgeDays } = opts;
  return {
    id,
    kind,
    cadence,
    async fetch(cursor: SourceCursor): Promise<FetchResult> {
      const since = conditionalSince(cursor.lastFetchedAt, IF_MODIFIED_MARGIN_MS);
      const items = await fetchRss(url, since);
      const filtered = items.filter(
        (i) =>
          isRecent(i.isoDate ?? i.pubDate, maxAgeDays) &&
          (opts.filter ? opts.filter(i) : true),
      );
      return { raw: filtered };
    },
    normalize(raw: unknown): Vuln | null {
      const item = raw as RssItem;
      return rssItemToVuln(item, {
        sourceId: id,
        ...(opts.ecosystems ? { ecosystems: opts.ecosystems } : {}),
        ...(opts.tags ? { tags: opts.tags } : {}),
        severityFromTitle: opts.severityFromTitle ?? true,
      });
    },
  };
}
