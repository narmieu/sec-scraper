import type { Cadence, Ecosystem, Tag, Vuln } from '@sec/shared';
import { fetchRss, isRecent, type RssItem } from '../pipeline/rss.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';
import { rssItemToVuln } from './_rss-helpers.js';

export interface MakeRssAdapterOpts {
  id: string;
  cadence?: Cadence;
  url: string;
  ecosystems?: Ecosystem[];
  tags?: Tag[];
  severityFromTitle?: boolean;
  filter?: (item: RssItem) => boolean;
}

export function makeRssAdapter(opts: MakeRssAdapterOpts): Adapter {
  const { id, cadence = 'hourly', url } = opts;
  return {
    id,
    cadence,
    async fetch(_cursor: SourceCursor): Promise<FetchResult> {
      const items = await fetchRss(url);
      const filtered = items.filter(
        (i) => isRecent(i.isoDate ?? i.pubDate) && (opts.filter ? opts.filter(i) : true),
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
