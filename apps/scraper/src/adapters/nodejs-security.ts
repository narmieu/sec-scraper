import { makeRssAdapter } from './_make-rss-adapter';

export const nodejsSecurityAdapter = makeRssAdapter({
  id: 'nodejs-security',
  kind: 'advisory',
  url: 'https://nodejs.org/en/feed/vulnerability.xml',
  ecosystems: ['npm'],
  tags: ['backend', 'frontend'],
  // Node.js security releases ship every 1-3 months. The default 14-day
  // window drops every entry, leaving the feed permanently empty.
  maxAgeDays: 365,
});
