import { makeRssAdapter } from './_make-rss-adapter';

// Official Symfony blog (via feedburner, which is what symfony.com itself
// links to). The blog has no security-only category feed (verified 404 on
// /blog/category/security-advisories.atom), so we filter by title/body
// keywords to surface CVE disclosures written by the Symfony core team.
export const symfonySecurityAdapter = makeRssAdapter({
  id: 'symfony-security',
  kind: 'advisory',
  url: 'https://feeds.feedburner.com/symfony/blog',
  ecosystems: ['composer'],
  tags: ['backend', 'symfony'],
  severityFromTitle: true,
  filter: (item) => {
    const t = (item.title + ' ' + (item.contentSnippet ?? '')).toLowerCase();
    return /\bcve-\d|security release|security advisor|vulnerab|disclosure/i.test(t);
  },
});
