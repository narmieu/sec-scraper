import { makeRssAdapter } from './_make-rss-adapter';

export const githubSecurityLabAdapter = makeRssAdapter({
  id: 'github-security-lab',
  kind: 'research',
  url: 'https://github.blog/category/security/feed/',
  tags: ['general'],
});
