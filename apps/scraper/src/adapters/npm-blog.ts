import { makeRssAdapter } from './_make-rss-adapter';

// Official npm changelog feed on github.blog (npm is part of GitHub since
// 2020 and blog.npmjs.org has no working feed). Filtered to security /
// advisory / malware / supply-chain keywords because the npm changelog
// covers more than security.
export const npmBlogAdapter = makeRssAdapter({
  id: 'npm-blog',
  url: 'https://github.blog/changelog/label/npm/feed/',
  ecosystems: ['npm'],
  tags: ['frontend'],
  filter: (item) => {
    const t = (item.title + ' ' + (item.contentSnippet ?? '')).toLowerCase();
    return /security|vulnerab|advisor|cve-|malware|supply.chain/i.test(t);
  },
});
