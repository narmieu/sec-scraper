import { makeRssAdapter } from './_make-rss-adapter.js';

export const symfonyBlogAdapter = makeRssAdapter({
  id: 'symfony-blog',
  url: 'https://symfony.com/blog/category/security-advisories.atom',
  ecosystems: ['composer'],
  tags: ['backend', 'symfony'],
});
