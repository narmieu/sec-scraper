import { makeRssAdapter } from './_make-rss-adapter';

export const cloudflareBlogAdapter = makeRssAdapter({
  id: 'cloudflare-blog',
  url: 'https://blog.cloudflare.com/rss/',
  tags: ['general'],
  filter: (item) => {
    const t = (item.title + ' ' + (item.contentSnippet ?? '')).toLowerCase();
    return /security|cve-|advisor|vulnerab|breach|exploit|disclosure/.test(t);
  },
});
