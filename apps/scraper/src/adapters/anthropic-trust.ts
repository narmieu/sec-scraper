import type { Vuln } from '@sec/shared';
import type { Adapter, FetchResult, SourceCursor } from './types.js';
import { htmlRowToVuln, scrapeHtmlList, type ScrapeRow } from './_html-helpers.js';

const BASE = 'https://trust.anthropic.com';
const URL = `${BASE}/security-bulletins`;

export const anthropicTrustAdapter: Adapter = {
  id: 'anthropic-trust',
  cadence: '6h',

  async fetch(_cursor: SourceCursor): Promise<FetchResult> {
    const rows = await scrapeHtmlList(URL, ($) => {
      const out: ScrapeRow[] = [];
      $('a').each((_, el) => {
        const href = $(el).attr('href') ?? '';
        const title = $(el).text().trim();
        if (!title) return;
        if (!/bulletin|advisor|cve|security/i.test(title) && !/bulletin|advisor/i.test(href)) return;
        out.push({ title, url: href });
      });
      return out;
    });
    return { raw: rows };
  },

  normalize(raw: unknown): Vuln | null {
    const r = raw as ScrapeRow | null;
    if (!r?.title) return null;
    return htmlRowToVuln(r, 'anthropic-trust', BASE);
  },
};
