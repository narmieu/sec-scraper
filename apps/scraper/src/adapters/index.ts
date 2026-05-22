import type { Adapter, Enricher } from './types.js';
import { ghsaAdapter } from './ghsa.js';
import { osvAdapter } from './osv.js';
import { nvdAdapter } from './nvd.js';
import { packagistAdapter } from './packagist.js';
import { epssEnricher } from './epss.js';
import { kevEnricher } from './cisa-kev.js';
import { hackernewsAdapter } from './hackernews.js';
import { thehackernewsAdapter } from './thehackernews.js';
import { bleepingcomputerAdapter } from './bleepingcomputer.js';
import { snykRssAdapter } from './snyk-rss.js';
import { sonatypeRssAdapter } from './sonatype-rss.js';
import { symfonyBlogAdapter } from './symfony-blog.js';
import { nextjsReleasesAdapter } from './nextjs-releases.js';
import { avidAdapter } from './avid.js';
import { owaspLlmAdapter } from './owasp-llm.js';
import { mitreAtlasAdapter } from './mitre-atlas.js';
import { anthropicTrustAdapter } from './anthropic-trust.js';
import { openaiSecurityAdapter } from './openai-security.js';
import { hackeroneAiAdapter } from './hackerone-ai.js';
import { arxivCsCrAdapter } from './arxiv-cs-cr.js';

export const ADAPTERS: Adapter[] = [
  ghsaAdapter,
  osvAdapter,
  nvdAdapter,
  packagistAdapter,
  hackernewsAdapter,
  thehackernewsAdapter,
  bleepingcomputerAdapter,
  snykRssAdapter,
  sonatypeRssAdapter,
  symfonyBlogAdapter,
  nextjsReleasesAdapter,
  avidAdapter,
  owaspLlmAdapter,
  mitreAtlasAdapter,
  anthropicTrustAdapter,
  openaiSecurityAdapter,
  hackeroneAiAdapter,
  arxivCsCrAdapter,
];

export const ENRICHERS: Enricher[] = [epssEnricher, kevEnricher];

export function findAdapter(id: string): Adapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}
