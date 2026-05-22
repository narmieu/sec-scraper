import { makeRssAdapter } from './_make-rss-adapter.js';

export const snykRssAdapter = makeRssAdapter({
  id: 'snyk-rss',
  url: 'https://security.snyk.io/vuln/rss',
  ecosystems: ['npm', 'composer'],
  tags: ['general'],
});
