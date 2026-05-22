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

interface OsvItem {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  modified?: string;
  published?: string;
  severity?: { type: string; score: string }[];
  affected?: {
    package?: { ecosystem?: string; name?: string };
    ranges?: { type: string; events: { introduced?: string; fixed?: string }[] }[];
    versions?: string[];
  }[];
  references?: { type?: string; url: string }[];
  database_specific?: { severity?: string; cwe_ids?: string[] };
}

const ECO_MAP: Record<string, Ecosystem> = {
  npm: 'npm',
  packagist: 'composer',
  pypi: 'pypi',
};

const QUERIES: { name: string; ecosystem: 'npm' | 'Packagist' }[] = [
  { name: 'next', ecosystem: 'npm' },
  { name: 'react', ecosystem: 'npm' },
  { name: '@apollo/client', ecosystem: 'npm' },
  { name: 'antd', ecosystem: 'npm' },
  { name: 'axios', ecosystem: 'npm' },
  { name: 'lodash', ecosystem: 'npm' },
  { name: 'firebase', ecosystem: 'npm' },
  { name: 'lexical', ecosystem: 'npm' },
  { name: 'tinymce', ecosystem: 'npm' },
  { name: 'zod', ecosystem: 'npm' },
  { name: 'graphql', ecosystem: 'npm' },
  { name: 'symfony/symfony', ecosystem: 'Packagist' },
  { name: 'symfony/http-kernel', ecosystem: 'Packagist' },
  { name: 'symfony/security-bundle', ecosystem: 'Packagist' },
  { name: 'symfony/security-http', ecosystem: 'Packagist' },
  { name: 'symfony/serializer', ecosystem: 'Packagist' },
  { name: 'symfony/console', ecosystem: 'Packagist' },
  { name: 'symfony/messenger', ecosystem: 'Packagist' },
  { name: 'symfony/http-foundation', ecosystem: 'Packagist' },
  { name: 'symfony/form', ecosystem: 'Packagist' },
  { name: 'symfony/validator', ecosystem: 'Packagist' },
  { name: 'doctrine/orm', ecosystem: 'Packagist' },
  { name: 'doctrine/dbal', ecosystem: 'Packagist' },
  { name: 'doctrine/migrations', ecosystem: 'Packagist' },
  { name: 'twig/twig', ecosystem: 'Packagist' },
  { name: 'guzzlehttp/guzzle', ecosystem: 'Packagist' },
  { name: 'api-platform/core', ecosystem: 'Packagist' },
  { name: 'monolog/monolog', ecosystem: 'Packagist' },
];

function extractCvss(item: OsvItem): { vector?: string } {
  const sev = item.severity?.find((s) => s.type === 'CVSS_V3') ?? item.severity?.[0];
  if (!sev?.score) return {};
  return { vector: sev.score };
}

function rangeToString(events: { introduced?: string; fixed?: string }[]): {
  versions: string;
  fixedIn?: string;
} {
  const intro = events.find((e) => e.introduced)?.introduced;
  const fix = events.find((e) => e.fixed)?.fixed;
  if (intro && fix) return { versions: `>=${intro} <${fix}`, fixedIn: fix };
  if (fix) return { versions: `<${fix}`, fixedIn: fix };
  if (intro) return { versions: `>=${intro}` };
  return { versions: 'any' };
}

export const osvAdapter: Adapter = {
  id: 'osv',
  cadence: 'hourly',

  async fetch(_cursor: SourceCursor): Promise<FetchResult> {
    const all: OsvItem[] = [];
    for (const q of QUERIES) {
      try {
        const body = JSON.stringify({ package: { name: q.name, ecosystem: q.ecosystem } });
        const r = await fetchJson<{ vulns?: OsvItem[] }>('https://api.osv.dev/v1/query', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          retries: 2,
        });
        if (r.vulns) all.push(...r.vulns);
      } catch {
        // ignore individual query failure
      }
    }
    return { raw: all };
  },

  normalize(raw: unknown): Vuln | null {
    const r = raw as OsvItem | null;
    if (!r || !r.id) return null;

    const cve = r.aliases?.find((a) => a.startsWith('CVE-'));
    const ghsa = r.aliases?.find((a) => a.startsWith('GHSA-'));
    const cvssInfo = extractCvss(r);
    const cvss = parseCvssScore(cvssInfo.vector);
    const severity =
      cvss !== undefined && cvss > 0
        ? cvssToSeverity(cvss)
        : deriveSeverity({ ghsaSeverity: r.database_specific?.severity });

    const ecosystems = new Set<Ecosystem>();
    const affected = (r.affected ?? []).flatMap((a) => {
      const ecoRaw = a.package?.ecosystem?.toLowerCase() ?? '';
      const eco = ECO_MAP[ecoRaw] ?? 'generic';
      ecosystems.add(eco);
      const name = a.package?.name ?? '';
      if (!name) return [];
      const ranges = a.ranges ?? [];
      if (ranges.length === 0) return [normalizeAffected({ ecosystem: eco, package: name, versions: 'any' })];
      return ranges.map((rng) => {
        const { versions, fixedIn } = rangeToString(rng.events);
        return normalizeAffected({
          ecosystem: eco,
          package: name,
          versions,
          ...(fixedIn ? { fixedIn } : {}),
        });
      });
    });

    const url =
      r.references?.find((ref) => ref.type === 'ADVISORY')?.url ??
      r.references?.[0]?.url ??
      `https://osv.dev/vulnerability/${r.id}`;

    const vuln: Vuln = {
      id: canonicalId({ cveId: cve, ghsaId: ghsa ?? r.id }),
      aliases: r.aliases ?? [],
      title: cleanText(r.summary || r.id),
      summary: cleanText(r.summary || ''),
      details: cleanText(r.details || ''),
      severity,
      ecosystems: [...ecosystems],
      cwe: r.database_specific?.cwe_ids ?? [],
      affected,
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0,
      kev: false,
      publishedAt: toIsoDate(r.published),
      modifiedAt: toIsoDate(r.modified),
      mergedAt: new Date().toISOString(),
      sources: [
        {
          source: 'osv',
          externalId: r.id,
          url,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags: [],
    };
    if (cve) vuln.cveId = cve;
    if (ghsa) vuln.ghsaId = ghsa;
    if (cvss !== undefined) vuln.cvss = cvss;
    if (cvssInfo.vector) vuln.cvssVector = cvssInfo.vector;
    return vuln;
  },
};

function parseCvssScore(vector: string | undefined): number | undefined {
  if (!vector) return undefined;
  // OSV often stores raw vector. Score extraction is approximate from /score field.
  const m = vector.match(/score[=:]\s*([\d.]+)/i);
  if (m && m[1]) return Number(m[1]);
  return undefined;
}
