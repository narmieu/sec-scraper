import { makeRssAdapter } from './_make-rss-adapter';

// FriendsOfPHP/security-advisories is the canonical machine-readable list of
// PHP security advisories (Symfony + Doctrine + Laravel + broader PHP).
// Commits atom feed surfaces every new advisory as a commit.
export const symfonyBlogAdapter = makeRssAdapter({
  id: 'symfony-blog',
  url: 'https://github.com/FriendsOfPHP/security-advisories/commits.atom',
  ecosystems: ['composer'],
  tags: ['backend', 'symfony'],
  filter: (item) => {
    const t = (item.title + ' ' + (item.contentSnippet ?? '')).toLowerCase();
    // commits include things like "Add" for new advisory entries
    return /symfony|doctrine|twig|guzzle|laravel|monolog|cve-|advisor|add /i.test(t);
  },
});
