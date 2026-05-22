import { makeRssAdapter } from './_make-rss-adapter.js';

export const bleepingcomputerAdapter = makeRssAdapter({
  id: 'bleepingcomputer',
  url: 'https://www.bleepingcomputer.com/feed/',
  tags: ['general'],
});
