import { makeRssAdapter } from './_make-rss-adapter';

export const vercelChangelogAdapter = makeRssAdapter({
  id: 'vercel-changelog',
  kind: 'changelog',
  url: 'https://vercel.com/changelog/rss.xml',
  tags: ['frontend', 'nextjs'],
  filter: (item) => {
    const t = (item.title + ' ' + (item.contentSnippet ?? '')).toLowerCase();
    return /security|cve-|advisor|vulnerab|patch|fix/.test(t);
  },
});
