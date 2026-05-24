import { makeRssAdapter } from './_make-rss-adapter';

export const phpSecurityAdapter = makeRssAdapter({
  id: 'php-security',
  kind: 'advisory',
  url: 'https://www.php.net/feed.atom',
  ecosystems: ['composer'],
  tags: ['backend'],
  filter: (item) => /security|cve-|advisor|vulnerab/i.test(item.title + ' ' + (item.contentSnippet ?? '')),
});
