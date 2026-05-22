import type { Ecosystem, Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import {
  canonicalId,
  cleanText,
  cvssToSeverity,
  deriveSeverity,
  normalizeAffected,
  toIsoDate,
} from '../pipeline/normalize.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

const REPOS = [
  // Symfony / PHP backend
  'symfony/symfony',
  'doctrine/orm',
  'doctrine/dbal',
  'twig/twig',
  // npm / frontend frameworks + libs
  'vercel/next.js',
  'facebook/react',
  'apollographql/apollo-client',
  'axios/axios',
  'lodash/lodash',
  'ant-design/ant-design',
  'lexical-lsp/lexical',
  // npm / Node ecosystem
  'nodejs/node',
  'npm/cli',
  'vitejs/vite',
  'microsoft/TypeScript',
  'colinhacks/zod',
  'getsentry/sentry-javascript',
  'firebase/firebase-js-sdk',
  'tinymce/tinymce',
];

interface RepoAdvisory {
  ghsa_id: string;
  cve_id?: string | null;
  summary: string;
  description: string;
  severity: string;
  cvss?: { score?: number | null; vector_string?: string | null };
  cwe_ids?: string[];
  identifiers?: { type: string; value: string }[];
  vulnerabilities?: {
    package: { ecosystem: string; name: string };
    vulnerable_version_range: string;
    patched_versions?: string | null;
  }[];
  references?: ({ url: string } | string)[];
  published_at: string;
  updated_at: string;
  html_url: string;
  state?: string;
}

interface RawItem {
  repo: string;
  advisory: RepoAdvisory;
}

const ECO_MAP: Record<string, Ecosystem> = {
  npm: 'npm',
  composer: 'composer',
  pip: 'pypi',
  pypi: 'pypi',
};

function mapEcosystem(e: string): Ecosystem {
  return ECO_MAP[e.toLowerCase()] ?? 'generic';
}

function githubHeaders(): Record<string, string> {
  const token = process.env['GITHUB_TOKEN'] || process.env['SCRAPER_PAT'];
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return headers;
}

export const githubRepoAdvisoriesAdapter: Adapter = {
  id: 'github-repo-advisories',
  cadence: 'hourly',

  async fetch(cursor: SourceCursor): Promise<FetchResult> {
    const sinceMs = cursor.lastFetchedAt
      ? new Date(cursor.lastFetchedAt).getTime()
      : Date.now() - 24 * 3600_000;
    const headers = githubHeaders();
    const all: RawItem[] = [];

    for (const repo of REPOS) {
      try {
        const items = await fetchJson<RepoAdvisory[]>(
          `https://api.github.com/repos/${repo}/security-advisories?state=published&per_page=100`,
          { headers, retries: 2 },
        );
        for (const a of items) {
          const t = new Date(a.updated_at).getTime();
          if (Number.isNaN(t) || t < sinceMs) continue;
          all.push({ repo, advisory: a });
        }
      } catch {
        // per-repo failure is non-fatal; continue with the next repo
      }
    }

    return { raw: all };
  },

  normalize(raw: unknown): Vuln | null {
    const item = raw as RawItem | null;
    if (!item || !item.advisory?.ghsa_id) return null;
    const a = item.advisory;

    const cvssScore = a.cvss?.score ?? undefined;
    const severity =
      cvssScore !== undefined && cvssScore > 0
        ? cvssToSeverity(cvssScore)
        : deriveSeverity({ ghsaSeverity: a.severity });

    const ecosystems = new Set<Ecosystem>();
    const affected = (a.vulnerabilities ?? []).map((v) => {
      const eco = mapEcosystem(v.package.ecosystem);
      ecosystems.add(eco);
      return normalizeAffected({
        ecosystem: eco,
        package: v.package.name,
        versions: v.vulnerable_version_range || 'any',
        ...(v.patched_versions ? { fixedIn: v.patched_versions } : {}),
      });
    });

    const aliases = (a.identifiers ?? [])
      .map((i) => i.value)
      .filter((v) => v !== a.ghsa_id);

    const tags: Vuln['tags'] = [];
    for (const aff of affected) {
      if (aff.ecosystem === 'npm') tags.push('frontend');
      if (aff.ecosystem === 'composer') tags.push('backend');
      if (aff.package.startsWith('symfony/')) tags.push('symfony');
      if (aff.package === 'next') tags.push('nextjs');
    }

    const vuln: Vuln = {
      id: canonicalId({ cveId: a.cve_id ?? undefined, ghsaId: a.ghsa_id }),
      ghsaId: a.ghsa_id,
      aliases,
      title: cleanText(a.summary || a.ghsa_id),
      summary: cleanText(a.summary || ''),
      details: cleanText(a.description || ''),
      severity,
      ecosystems: [...ecosystems],
      cwe: a.cwe_ids ?? [],
      affected,
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0,
      kev: false,
      publishedAt: toIsoDate(a.published_at),
      modifiedAt: toIsoDate(a.updated_at),
      mergedAt: new Date().toISOString(),
      sources: [
        {
          source: 'github-repo-advisories',
          externalId: `${item.repo}:${a.ghsa_id}`,
          url: a.html_url,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags: [...new Set(tags)],
    };
    if (a.cve_id) vuln.cveId = a.cve_id;
    if (cvssScore !== undefined) vuln.cvss = cvssScore;
    if (a.cvss?.vector_string) vuln.cvssVector = a.cvss.vector_string;
    return vuln;
  },
};
