import type { StackTargets } from '@/pipeline/stack-targets.js';
import type { Adapter, Enricher } from './types.js';
import { ghsaAdapter } from './ghsa.js';
import { makeOsvAdapter } from './osv.js';
import { nvdAdapter } from './nvd.js';
import { makeCveOrgAdapter } from './cve-org.js';
import { packagistAdapter } from './packagist.js';
import { epssEnricher } from './epss.js';
import { kevEnricher } from './cisa-kev.js';
import { friendsofphpAdvisoriesAdapter } from './friendsofphp-advisories.js';
import { symfonySecurityAdapter } from './symfony-security.js';
import { npmBlogAdapter } from './npm-blog.js';
import { makeGithubRepoAdvisoriesAdapter } from './github-repo-advisories.js';
import { nextjsReleasesAdapter } from './nextjs-releases.js';
import { nodejsSecurityAdapter } from './nodejs-security.js';
import { phpSecurityAdapter } from './php-security.js';
import { githubSecurityLabAdapter } from './github-security-lab.js';
import { projectZeroAdapter } from './project-zero.js';
import { cisaAlertsAdapter } from './cisa-alerts.js';
import { cisaVulnrichmentAdapter } from './cisa-vulnrichment.js';
import { cloudflareBlogAdapter } from './cloudflare-blog.js';
import { vercelChangelogAdapter } from './vercel-changelog.js';
import { avidAdapter } from './avid.js';
import { owaspLlmAdapter } from './owasp-llm.js';
import { mitreAtlasAdapter } from './mitre-atlas.js';
import { anthropicTrustAdapter } from './anthropic-trust.js';
import { openaiSecurityAdapter } from './openai-security.js';
import { hackeroneAiAdapter } from './hackerone-ai.js';
import { arxivCsCrAdapter } from './arxiv-cs-cr.js';

export function buildAdapters(targets: StackTargets): Adapter[] {
  return [
    ghsaAdapter,
    makeOsvAdapter(targets),
    nvdAdapter,
    makeCveOrgAdapter(targets),
    packagistAdapter,
    friendsofphpAdvisoriesAdapter,
    symfonySecurityAdapter,
    npmBlogAdapter,
    makeGithubRepoAdvisoriesAdapter(targets),
    nextjsReleasesAdapter,
    nodejsSecurityAdapter,
    phpSecurityAdapter,
    githubSecurityLabAdapter,
    projectZeroAdapter,
    cisaAlertsAdapter,
    cisaVulnrichmentAdapter,
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
}

export const ENRICHERS: Enricher[] = [epssEnricher, kevEnricher];
