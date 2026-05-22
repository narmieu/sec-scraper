import type { Adapter, Enricher } from './types.js';
import { ghsaAdapter } from './ghsa.js';
import { osvAdapter } from './osv.js';
import { nvdAdapter } from './nvd.js';
import { packagistAdapter } from './packagist.js';
import { epssEnricher } from './epss.js';
import { kevEnricher } from './cisa-kev.js';
import { friendsofphpAdvisoriesAdapter } from './friendsofphp-advisories.js';
import { symfonySecurityAdapter } from './symfony-security.js';
import { npmBlogAdapter } from './npm-blog.js';
import { githubRepoAdvisoriesAdapter } from './github-repo-advisories.js';
import { nextjsReleasesAdapter } from './nextjs-releases.js';
import { nodejsSecurityAdapter } from './nodejs-security.js';
import { phpSecurityAdapter } from './php-security.js';
import { githubSecurityLabAdapter } from './github-security-lab.js';
import { projectZeroAdapter } from './project-zero.js';
import { cisaAlertsAdapter } from './cisa-alerts.js';
import { cloudflareBlogAdapter } from './cloudflare-blog.js';
import { vercelChangelogAdapter } from './vercel-changelog.js';
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
  friendsofphpAdvisoriesAdapter,
  symfonySecurityAdapter,
  npmBlogAdapter,
  githubRepoAdvisoriesAdapter,
  nextjsReleasesAdapter,
  nodejsSecurityAdapter,
  phpSecurityAdapter,
  githubSecurityLabAdapter,
  projectZeroAdapter,
  cisaAlertsAdapter,
  cloudflareBlogAdapter,
  vercelChangelogAdapter,
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
