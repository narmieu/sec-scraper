import type { Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import {
  canonicalId,
  cleanText,
  cvssToSeverity,
  toIsoDate,
} from '../pipeline/normalize.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

interface NvdResponse {
  vulnerabilities?: { cve: NvdCve }[];
}

interface NvdCve {
  id: string;
  published: string;
  lastModified: string;
  descriptions?: { lang: string; value: string }[];
  metrics?: {
    cvssMetricV31?: { cvssData: { baseScore: number; vectorString: string } }[];
    cvssMetricV30?: { cvssData: { baseScore: number; vectorString: string } }[];
  };
  weaknesses?: { description: { lang: string; value: string }[] }[];
  references?: { url: string }[];
}

export const nvdAdapter: Adapter = {
  id: 'nvd',
  kind: 'advisory',
  cadence: 'hourly',

  async fetch(cursor: SourceCursor): Promise<FetchResult> {
    const lastMod =
      cursor.lastFetchedAt
        ? new Date(new Date(cursor.lastFetchedAt).getTime() - 30 * 60_000)
        : new Date(Date.now() - 2 * 60 * 60_000);
    const lastModEnd = new Date();
    const lastModStartIso = lastMod.toISOString().split('.')[0]!;
    const lastModEndIso = lastModEnd.toISOString().split('.')[0]!;
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?lastModStartDate=${lastModStartIso}&lastModEndDate=${lastModEndIso}&resultsPerPage=200`;
    const headers: Record<string, string> = {};
    const key = process.env['NVD_API_KEY'];
    if (key) headers['apiKey'] = key;
    const data = await fetchJson<NvdResponse>(url, { headers, retries: 2 });
    return { raw: data.vulnerabilities?.map((v) => v.cve) ?? [] };
  },

  normalize(raw: unknown): Vuln | null {
    const r = raw as NvdCve | null;
    if (!r || !r.id) return null;

    const descEn = r.descriptions?.find((d) => d.lang === 'en')?.value ?? '';
    const v31 = r.metrics?.cvssMetricV31?.[0]?.cvssData;
    const v30 = r.metrics?.cvssMetricV30?.[0]?.cvssData;
    const cvss = v31?.baseScore ?? v30?.baseScore;
    const vector = v31?.vectorString ?? v30?.vectorString;
    const severity = cvssToSeverity(cvss);

    const cwes = (r.weaknesses ?? [])
      .flatMap((w) => w.description.filter((d) => d.lang === 'en').map((d) => d.value))
      .filter((c) => c.startsWith('CWE-'));

    const refUrl =
      r.references?.[0]?.url ?? `https://nvd.nist.gov/vuln/detail/${r.id}`;

    const vuln: Vuln = {
      id: canonicalId({ cveId: r.id }),
      cveId: r.id,
      aliases: [r.id],
      title: cleanText(descEn.slice(0, 200) || r.id),
      summary: cleanText(descEn),
      severity,
      ecosystems: ['generic'],
      cwe: cwes,
      affected: [],
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0,
      kev: false,
      publishedAt: toIsoDate(r.published),
      modifiedAt: toIsoDate(r.lastModified),
      mergedAt: new Date().toISOString(),
      sources: [
        {
          source: 'nvd',
          externalId: r.id,
          url: refUrl,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags: [],
    };
    if (cvss !== undefined) vuln.cvss = cvss;
    if (vector) vuln.cvssVector = vector;
    return vuln;
  },
};
