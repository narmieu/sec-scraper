import { makeRssAdapter } from './_make-rss-adapter';

export const cisaAlertsAdapter = makeRssAdapter({
  id: 'cisa-alerts',
  url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
  ecosystems: ['infrastructure'],
  tags: ['exploited', 'general'],
});
