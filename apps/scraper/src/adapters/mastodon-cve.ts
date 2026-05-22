import { makeRssAdapter } from './_make-rss-adapter';

// Mastodon hashtag feeds are public RSS. infosec.exchange is the largest
// security-focused instance — #cve, #vulnerability, #zeroday are high-signal.
export const mastodonCveAdapter = makeRssAdapter({
  id: 'mastodon-cve',
  url: 'https://infosec.exchange/tags/cve.rss',
  tags: ['general'],
});

export const mastodonZeroDayAdapter = makeRssAdapter({
  id: 'mastodon-zeroday',
  url: 'https://infosec.exchange/tags/zeroday.rss',
  tags: ['general', 'zero-day'],
});
