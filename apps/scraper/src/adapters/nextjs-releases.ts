import { makeRssAdapter } from './_make-rss-adapter.js';
import type { RssItem } from '../pipeline/rss.js';

function looksSecurity(item: RssItem): boolean {
  const t = (item.title + ' ' + (item.contentSnippet ?? '')).toLowerCase();
  return /security|cve-|advisor|vulnerab/.test(t);
}

export const nextjsReleasesAdapter = makeRssAdapter({
  id: 'nextjs-releases',
  kind: 'changelog',
  url: 'https://github.com/vercel/next.js/releases.atom',
  ecosystems: ['npm'],
  tags: ['frontend', 'nextjs'],
  filter: looksSecurity,
});
