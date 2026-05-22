import { makeRssAdapter } from './_make-rss-adapter';

export const nodejsSecurityAdapter = makeRssAdapter({
  id: 'nodejs-security',
  url: 'https://nodejs.org/en/feed/vulnerability.xml',
  ecosystems: ['npm'],
  tags: ['backend', 'frontend'],
});
