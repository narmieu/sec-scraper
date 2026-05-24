import { makeRssAdapter } from './_make-rss-adapter';

export const projectZeroAdapter = makeRssAdapter({
  id: 'project-zero',
  kind: 'research',
  url: 'https://googleprojectzero.blogspot.com/feeds/posts/default',
  tags: ['general', 'zero-day'],
});
