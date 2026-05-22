import type { Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import {
  canonicalId,
  cleanText,
  deriveSeverity,
  normalizeAffected,
  toIsoDate,
} from '../pipeline/normalize.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

interface PackagistResponse {
  advisories?: Record<string, PackagistAdvisory[]>;
}

interface PackagistAdvisory {
  advisoryId: string;
  packageName: string;
  remoteId?: string;
  title: string;
  link?: string;
  cve?: string | null;
  affectedVersions: string;
  source?: string;
  reportedAt: string;
  composerRepository?: string;
  severity?: string;
}

const PACKAGES = [
  'symfony/symfony',
  'symfony/http-kernel',
  'symfony/security-bundle',
  'symfony/serializer',
  'doctrine/orm',
  'doctrine/dbal',
  'twig/twig',
  'guzzlehttp/guzzle',
  'monolog/monolog',
];

export const packagistAdapter: Adapter = {
  id: 'packagist',
  cadence: 'hourly',

  async fetch(_cursor: SourceCursor): Promise<FetchResult> {
    const params = PACKAGES.map((p) => `packages[]=${encodeURIComponent(p)}`).join('&');
    const url = `https://packagist.org/api/security-advisories/?${params}`;
    const data = await fetchJson<PackagistResponse>(url);
    const items: PackagistAdvisory[] = [];
    for (const arr of Object.values(data.advisories ?? {})) items.push(...arr);
    return { raw: items };
  },

  normalize(raw: unknown): Vuln | null {
    const r = raw as PackagistAdvisory | null;
    if (!r || !r.advisoryId) return null;

    const severity = deriveSeverity({ ghsaSeverity: r.severity });
    const affected = [
      normalizeAffected({
        ecosystem: 'composer',
        package: r.packageName,
        versions: r.affectedVersions || 'any',
      }),
    ];

    const tags: Vuln['tags'] = ['backend'];
    if (r.packageName.startsWith('symfony/')) tags.push('symfony');

    const url = r.link ?? `https://packagist.org/packages/${r.packageName}`;

    const vuln: Vuln = {
      id: canonicalId({ cveId: r.cve ?? undefined, ghsaId: r.advisoryId }),
      aliases: [r.advisoryId, ...(r.cve ? [r.cve] : [])],
      title: cleanText(r.title || r.advisoryId),
      summary: cleanText(r.title || ''),
      severity,
      ecosystems: ['composer'],
      cwe: [],
      affected,
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0,
      kev: false,
      publishedAt: toIsoDate(r.reportedAt),
      modifiedAt: toIsoDate(r.reportedAt),
      mergedAt: new Date().toISOString(),
      sources: [
        {
          source: 'packagist',
          externalId: r.advisoryId,
          url,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags: [...new Set(tags)],
    };
    if (r.cve) vuln.cveId = r.cve;
    return vuln;
  },
};
