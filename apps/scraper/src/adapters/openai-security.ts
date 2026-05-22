import type { Vuln } from '@sec/shared';
import type { Adapter, FetchResult, SourceCursor } from './types.js';
import { htmlRowToVuln, scrapeHtmlList, type ScrapeRow } from './_html-helpers.js';

const BASE = 'https://openai.com';
const URL = `${BASE}/security`;

export const openaiSecurityAdapter: Adapter = {
  id: 'openai-security',
  cadence: '6h',

  async fetch(_cursor: SourceCursor): Promise<FetchResult> {
    const rows = await scrapeHtmlList(URL, ($) => {
      const out: ScrapeRow[] = [];
      $('article, a').each((_, el) => {
        const $el = $(el);
        const title = $el.find('h2, h3').first().text().trim() || $el.text().trim();
        const href = $el.is('a') ? $el.attr('href') ?? '' : $el.find('a').first().attr('href') ?? '';
        if (!title || !href) return;
        if (!/security|advisor|cve|bulletin/i.test(title)) return;
        out.push({ title, url: href });
      });
      return out.slice(0, 20);
    });
    return { raw: rows };
  },

  normalize(raw: unknown): Vuln | null {
    const r = raw as ScrapeRow | null;
    if (!r?.title) return null;
    return htmlRowToVuln(r, 'openai-security', BASE);
  },
};
