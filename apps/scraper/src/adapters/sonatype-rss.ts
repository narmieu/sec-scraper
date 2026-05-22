import { makeRssAdapter } from './_make-rss-adapter.js';

export const sonatypeRssAdapter = makeRssAdapter({
  id: 'sonatype-rss',
  url: 'https://ossindex.sonatype.org/rest/v1/feed',
  ecosystems: ['npm', 'composer'],
  tags: ['general'],
});
