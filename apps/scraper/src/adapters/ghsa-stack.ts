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

interface GhsaItem {
  ghsa_id: string;
  cve_id: string | null;
  summary: string;
  description: string;
  severity: string;
  cvss?: { score?: number | null; vector_string?: string | null };
  cwes?: { cwe_id: string }[];
  identifiers?: { type: string; value: string }[];
  vulnerabilities?: {
    package: { ecosystem: string; name: string };
    vulnerable_version_range: string;
    first_patched_version: string | null;
  }[];
  references?: { url: string }[];
  published_at: string;
  updated_at: string;
  html_url: string;
}

const API_ECO: Record<'npm' | 'Packagist', string> = {
  npm: 'npm',
  Packagist: 'composer',
};

export function makeGhsaStackAdapter(targets: StackTargets): Adapter {
  return {
    id: 'ghsa-stack',
    cadence: '6h',

    async fetch(_cursor: SourceCursor): Promise<FetchResult> {
      const headers = githubHeaders();
      const seen = new Map<string, GhsaItem>();

      for (const q of targets.osvQueries) {
        const ecosystem = API_ECO[q.ecosystem];
        const url =
          `https://api.github.com/advisories` +
          `?ecosystem=${encodeURIComponent(ecosystem)}` +
          `&affects=${encodeURIComponent(q.name)}` +
          `&per_page=100&sort=updated&direction=desc`;
        try {
          const items = await fetchJson<GhsaItem[]>(url, { headers, retries: 2 });
          for (const it of items) {
            if (it?.ghsa_id) seen.set(it.ghsa_id, it);
          }
        } catch {
          // per-package failure is non-fatal; continue with next package
        }
      }

      return { raw: [...seen.values()] };
    },

    normalize(raw: unknown): Vuln | null {
      const r = raw as GhsaItem | null;
      if (!r?.ghsa_id) return null;

      const cvss = r.cvss?.score ?? undefined;
      const severity =
        cvss !== undefined && cvss > 0
          ? cvssToSeverity(cvss)
          : deriveSeverity({ ghsaSeverity: r.severity });

      const ecosystems = new Set<Ecosystem>();
      const affected = (r.vulnerabilities ?? []).map((v) => {
        const eco = mapEcosystem(v.package.ecosystem);
        ecosystems.add(eco);
        return normalizeAffected({
          ecosystem: eco,
          package: v.package.name,
          versions: v.vulnerable_version_range || 'any',
          ...(v.first_patched_version ? { fixedIn: v.first_patched_version } : {}),
        });
      });

      const aliases = (r.identifiers ?? [])
        .map((i) => i.value)
        .filter((v) => v !== r.ghsa_id);

      const tags: Vuln['tags'] = [];
      for (const a of affected) {
        if (a.ecosystem === 'npm') tags.push('frontend');
        if (a.ecosystem === 'composer') tags.push('backend');
        if (a.package.startsWith('symfony/')) tags.push('symfony');
        if (a.package === 'next') tags.push('nextjs');
      }

      const vuln: Vuln = {
        id: canonicalId({ cveId: r.cve_id ?? undefined, ghsaId: r.ghsa_id }),
        ghsaId: r.ghsa_id,
        aliases,
        title: cleanText(r.summary || r.ghsa_id),
        summary: cleanText(r.summary || ''),
        details: cleanText(r.description || ''),
        severity,
        ecosystems: [...ecosystems],
        cwe: (r.cwes ?? []).map((c) => c.cwe_id),
        affected,
        stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
        priority: 0,
        kev: false,
        publishedAt: toIsoDate(r.published_at),
        modifiedAt: toIsoDate(r.updated_at),
        mergedAt: new Date().toISOString(),
        sources: [
          {
            source: 'ghsa-stack',
            externalId: r.ghsa_id,
            url: r.html_url,
            fetchedAt: new Date().toISOString(),
          },
        ],
        tags: [...new Set(tags)],
      };
      if (r.cve_id) vuln.cveId = r.cve_id;
      if (cvss !== undefined) vuln.cvss = cvss;
      if (r.cvss?.vector_string) vuln.cvssVector = r.cvss.vector_string;
      return vuln;
    },
  };
}
