import { makeRssAdapter } from './_make-rss-adapter.js';

export const thehackernewsAdapter = makeRssAdapter({
  id: 'thehackernews',
  url: 'https://feeds.feedburner.com/TheHackersNews',
  tags: ['general'],
});
