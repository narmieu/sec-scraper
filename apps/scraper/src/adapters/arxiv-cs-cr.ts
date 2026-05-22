import { makeRssAdapter } from './_make-rss-adapter.js';
import type { RssItem } from '../pipeline/rss.js';

const AI_KEYWORDS = [
  'llm',
  'language model',
  'prompt injection',
  'jailbreak',
  'adversarial',
  'model alignment',
  'rag',
  'agent',
  'tool use',
  'gpt',
  'claude',
];

function looksAiSecurity(item: RssItem): boolean {
  const t = `${item.title} ${item.contentSnippet ?? ''}`.toLowerCase();
  return AI_KEYWORDS.some((k) => t.includes(k));
}

export const arxivCsCrAdapter = makeRssAdapter({
  id: 'arxiv-cs-cr',
  cadence: '6h',
  url: 'https://export.arxiv.org/rss/cs.CR',
  ecosystems: ['ai-llm'],
  tags: ['ai-llm'],
  filter: looksAiSecurity,
});
