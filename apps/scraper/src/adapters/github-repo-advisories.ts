import type { Ecosystem, Vuln } from '@sec/shared';
import { fetchJson } from '@/pipeline/fetch.js';
import { mapEcosystem } from '@/pipeline/ecosystem.js';
import { githubHeaders } from '@/pipeline/github.js';
import {
  canonicalId,
  cleanText,
  cvssToSeverity,
  deriveSeverity,
  normalizeAffected,
  toIsoDate,
} from '@/pipeline/normalize.js';
import type { StackTargets } from '@/pipeline/stack-targets.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

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

export function makeGithubRepoAdvisoriesAdapter(targets: StackTargets): Adapter {
  return {
    id: 'github-repo-advisories',
    cadence: 'hourly',

    async fetch(cursor: SourceCursor): Promise<FetchResult> {
      const sinceMs = cursor.lastFetchedAt
        ? new Date(cursor.lastFetchedAt).getTime() - 30 * 60_000
        : Date.now() - 30 * 24 * 3600_000;
      const headers = githubHeaders();
      const all: RawItem[] = [];

      for (const repo of targets.repoSlugs) {
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
}
