import type { Ecosystem, Vuln } from '@sec/shared';
import { fetchJson } from '@/pipeline/fetch.js';
import { mapEcosystem } from '@/pipeline/ecosystem.js';
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

export function makeOsvAdapter(targets: StackTargets): Adapter {
  return {
    id: 'osv',
    kind: 'advisory',
    cadence: 'hourly',

    async fetch(_cursor: SourceCursor): Promise<FetchResult> {
      const all: OsvItem[] = [];
      for (const q of targets.osvQueries) {
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
        const eco = mapEcosystem(a.package?.ecosystem);
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
}

function parseCvssScore(vector: string | undefined): number | undefined {
  if (!vector) return undefined;
  const explicit = vector.match(/score[=:]\s*([\d.]+)/i);
  if (explicit && explicit[1]) return Number(explicit[1]);
  if (/^CVSS:\d/i.test(vector)) return cvssV3BaseScore(vector);
  return undefined;
}

const AV_W: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC_W: Record<string, number> = { L: 0.77, H: 0.44 };
const PR_U_W: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 };
const PR_C_W: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 };
const UI_W: Record<string, number> = { N: 0.85, R: 0.62 };
const CIA_W: Record<string, number> = { N: 0, L: 0.22, H: 0.56 };

function cvssV3BaseScore(vector: string): number | undefined {
  const parts: Record<string, string> = {};
  for (const seg of vector.split('/')) {
    const idx = seg.indexOf(':');
    if (idx === -1) continue;
    parts[seg.slice(0, idx)] = seg.slice(idx + 1);
  }
  const av = parts['AV'] ? AV_W[parts['AV']] : undefined;
  const ac = parts['AC'] ? AC_W[parts['AC']] : undefined;
  const ui = parts['UI'] ? UI_W[parts['UI']] : undefined;
  const c = parts['C'] ? CIA_W[parts['C']] : undefined;
  const i = parts['I'] ? CIA_W[parts['I']] : undefined;
  const a = parts['A'] ? CIA_W[parts['A']] : undefined;
  const scope = parts['S'];
  const prRaw = parts['PR'];
  if (av === undefined || ac === undefined || ui === undefined) return undefined;
  if (c === undefined || i === undefined || a === undefined) return undefined;
  if (!scope || !prRaw) return undefined;
  const pr = (scope === 'C' ? PR_C_W : PR_U_W)[prRaw];
  if (pr === undefined) return undefined;

  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact =
    scope === 'C' ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  if (impact <= 0) return 0;
  const exploitability = 8.22 * av * ac * pr * ui;
  const raw =
    scope === 'C'
      ? Math.min(1.08 * (impact + exploitability), 10)
      : Math.min(impact + exploitability, 10);
  return Math.ceil(raw * 10) / 10;
}
