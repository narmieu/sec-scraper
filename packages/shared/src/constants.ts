export const SOURCE_IDS = [
  'ghsa',
  'osv',
  'nvd',
  'packagist',
  'epss',
  'cisa-kev',
  'cisa-alerts',
  'hackernews',
  'thehackernews',
  'bleepingcomputer',
  'symfony-blog',
  'nextjs-releases',
  'nodejs-security',
  'php-security',
  'github-security-lab',
  'project-zero',
  'cloudflare-blog',
  'vercel-changelog',
  'mastodon-cve',
  'mastodon-zeroday',
  'avid',
  'owasp-llm',
  'mitre-atlas',
  'anthropic-trust',
  'openai-security',
  'hackerone-ai',
  'arxiv-cs-cr',
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

export const ECOSYSTEMS = [
  'npm',
  'composer',
  'pypi',
  'generic',
  'ai-llm',
  'infrastructure',
] as const;

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'unknown'] as const;

export const TAGS = [
  'frontend',
  'backend',
  'ai-llm',
  'exploited',
  'zero-day',
  'supply-chain',
  'symfony',
  'nextjs',
  'general',
] as const;

export const ROLLING_WINDOW_DAYS = 90;

export const CADENCES = ['hourly', '6h', 'daily'] as const;
export type Cadence = (typeof CADENCES)[number];

export const CADENCE_MS: Record<Cadence, number> = {
  hourly: 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
};
