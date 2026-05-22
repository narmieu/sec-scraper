import { makeRssAdapter } from './_make-rss-adapter';

// FriendsOfPHP/security-advisories is the canonical machine-readable list of
// PHP security advisories (Symfony + Doctrine + Twig + broader PHP).
// commits.atom surfaces every new advisory as a commit.
export const friendsofphpAdvisoriesAdapter = makeRssAdapter({
  id: 'friendsofphp-advisories',
  url: 'https://github.com/FriendsOfPHP/security-advisories/commits.atom',
  ecosystems: ['composer'],
  tags: ['backend', 'symfony'],
  filter: (item) => {
    const t = (item.title + ' ' + (item.contentSnippet ?? '')).toLowerCase();
    return /symfony|doctrine|twig|guzzle|laravel|monolog|cve-|advisor|add /i.test(t);
  },
});
