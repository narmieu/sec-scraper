import type { Tag, Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import { mapPool } from '../pipeline/pool.js';
import { githubHeaders } from '../pipeline/github.js';
import type { StackTargets } from '../pipeline/stack-targets.js';
import {
  canonicalId,
  cleanText,
  cvssToSeverity,
  toIsoDate,
} from '../pipeline/normalize.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

const REPO = 'cisagov/vulnrichment';

// GitHub API commit-detail fetches bounded for secondary rate limits; raw CVE
// records come from the raw.githubusercontent.com CDN and can run wider.
const COMMIT_CONCURRENCY = 5;
const RAW_CONCURRENCY = 10;

interface CommitListItem {
  sha: string;
  commit: { author: { date: string } };
}

interface CommitDetail {
  sha: string;
  files: { filename: string; status: 'added' | 'modified' | 'removed' }[];
}

interface VulnrichmentRecord {
  cveMetadata?: {
    cveId?: string;
    datePublished?: string;
    dateUpdated?: string;
  };
  containers?: {
    cna?: {
      title?: string;
      descriptions?: { lang: string; value: string }[];
      metrics?: {
        cvssV3_1?: { baseScore?: number; vectorString?: string };
      }[];
    };
    adp?: Array<{
      providerMetadata?: { shortName?: string };
      title?: string;
      metrics?: Array<{
        cvssV3_1?: { baseScore?: number; vectorString?: string };
        other?: { type?: string; content?: { id?: string } };
      }>;
    }>;
  };
}

interface RawItem {
  sha: string;
  path: string;
  cveId: string;
  record: VulnrichmentRecord;
}

export function makeCisaVulnrichmentAdapter(targets: StackTargets): Adapter {
  return {
  id: 'cisa-vulnrichment',
  kind: 'advisory',
  cadence: '6h',

  async fetch(cursor: SourceCursor): Promise<FetchResult> {
    const since =
      cursor.lastFetchedAt ?? new Date(Date.now() - 24 * 3600_000).toISOString();
    const headers = githubHeaders();

    let commits: CommitListItem[];
    try {
      commits = await fetchJson<CommitListItem[]>(
        `https://api.github.com/repos/${REPO}/commits?since=${encodeURIComponent(since)}&per_page=100`,
        { headers, retries: 2 },
      );
    } catch {
      return { raw: [] };
    }

    // Phase 1: fetch every commit's file list in parallel (bounded).
    const details = await mapPool(commits, COMMIT_CONCURRENCY, async (c) => {
      try {
        return await fetchJson<CommitDetail>(
          `https://api.github.com/repos/${REPO}/commits/${c.sha}`,
          { headers, retries: 2 },
        );
      } catch {
        return null;
      }
    });

    // Phase 2: dedupe by CVE id in commit order (in memory, deterministic).
    const seen = new Set<string>();
    const toFetch: { sha: string; filename: string; cveId: string }[] = [];
    for (let i = 0; i < commits.length; i++) {
      const detail = details[i];
      if (!detail) continue;
      const sha = commits[i]!.sha;
      for (const f of detail.files) {
        if (f.status === 'removed') continue;
        const m = f.filename.match(/\d{4}\/[^/]+\/(CVE-\d{4}-\d+)\.json$/);
        if (!m) continue;
        const cveId = m[1]!;
        if (seen.has(cveId)) continue;
        seen.add(cveId);
        toFetch.push({ sha, filename: f.filename, cveId });
      }
    }

    // Phase 3: fetch the raw records in parallel (CDN, wider bound).
    const fetched = await mapPool(toFetch, RAW_CONCURRENCY, async (t) => {
      const rawUrl = `https://raw.githubusercontent.com/${REPO}/${t.sha}/${t.filename}`;
      try {
        const record = await fetchJson<VulnrichmentRecord>(rawUrl, { retries: 1 });
        return { sha: t.sha, path: t.filename, cveId: t.cveId, record } satisfies RawItem;
      } catch {
        return null; // skip individual failure
      }
    });

    return { raw: fetched.filter((x): x is RawItem => x !== null) };
  },

  normalize(raw: unknown): Vuln | null {
    const item = raw as RawItem | null;
    if (!item || !item.record?.cveMetadata?.cveId) return null;

    const cna = item.record.containers?.cna ?? {};
    const adp = item.record.containers?.adp ?? [];

    const descEn =
      cna.descriptions?.find((d) => d.lang.startsWith('en'))?.value ?? '';

    const cnaMetric = cna.metrics?.find((m) => m.cvssV3_1);
    const adpMetric = adp.flatMap((a) => a.metrics ?? []).find((m) => m.cvssV3_1);
    const cvss = adpMetric?.cvssV3_1?.baseScore ?? cnaMetric?.cvssV3_1?.baseScore;
    const vector =
      adpMetric?.cvssV3_1?.vectorString ?? cnaMetric?.cvssV3_1?.vectorString;
    const severity = cvssToSeverity(cvss);

    const kev = adp.some((a) =>
      (a.metrics ?? []).some(
        (m) => m.other?.type === 'kev' || m.other?.content?.id === 'KEV',
      ),
    );

    // vulnrichment covers every recent CVE; keep only stack-relevant records
    // (matching cve-org's keyword gate) plus KEV entries, which are notable
    // regardless of stack. Drops the generic bulk that otherwise floods dedupe.
    const titleAndDesc = `${cna.title ?? ''} ${descEn}`;
    if (!kev && !targets.keywordRegex.test(titleAndDesc)) return null;

    const tags: Tag[] = kev ? ['exploited'] : [];

    const vuln: Vuln = {
      id: canonicalId({ cveId: item.cveId }),
      cveId: item.cveId,
      aliases: [item.cveId],
      title: cleanText((cna.title ?? descEn) || item.cveId),
      summary: cleanText(descEn),
      severity,
      ecosystems: ['generic'],
      cwe: [],
      affected: [],
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0,
      kev,
      publishedAt: toIsoDate(item.record.cveMetadata.datePublished),
      modifiedAt: toIsoDate(
        item.record.cveMetadata.dateUpdated ?? item.record.cveMetadata.datePublished,
      ),
      mergedAt: new Date().toISOString(),
      sources: [
        {
          source: 'cisa-vulnrichment',
          externalId: item.cveId,
          url: `https://github.com/${REPO}/blob/main/${item.path}`,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags,
    };
    if (cvss !== undefined) vuln.cvss = cvss;
    if (vector) vuln.cvssVector = vector;
    return vuln;
  },
  };
}
