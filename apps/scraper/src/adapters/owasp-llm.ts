import { makeRssAdapter } from './_make-rss-adapter.js';

export const owaspLlmAdapter = makeRssAdapter({
  id: 'owasp-llm',
  cadence: '6h',
  url: 'https://github.com/OWASP/www-project-top-10-for-large-language-model-applications/releases.atom',
  ecosystems: ['ai-llm'],
  tags: ['ai-llm'],
});
