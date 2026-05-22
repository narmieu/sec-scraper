import { stringSimilarity } from 'string-similarity-js';
import type { Affected, Ecosystem, Severity, SourceRef, Tag, Vuln } from '@sec/shared';

const SEV_RANK: Record<Severity, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const RANK_TO_SEV: Severity[] = ['unknown', 'low', 'medium', 'high', 'critical'];

const SIMILARITY_THRESHOLD = 0.85;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function dedupeMerge(items: Vuln[]): Vuln[] {
  const out: Vuln[] = [];
  const aliasIndex = new Map<string, number>();

  for (const item of items) {
    const matchIdx = findMatchIndex(item, out, aliasIndex);
    if (matchIdx >= 0) {
      out[matchIdx] = mergeRecords(out[matchIdx]!, item);
      indexAliases(out[matchIdx]!, matchIdx, aliasIndex);
    } else {
      const newIdx = out.push(item) - 1;
      indexAliases(item, newIdx, aliasIndex);
    }
  }
  return out;
}

function indexAliases(v: Vuln, idx: number, aliasIndex: Map<string, number>) {
  if (v.cveId) aliasIndex.set(v.cveId, idx);
  if (v.ghsaId) aliasIndex.set(v.ghsaId, idx);
  for (const a of v.aliases) aliasIndex.set(a, idx);
}

function findMatchIndex(item: Vuln, pool: Vuln[], aliasIndex: Map<string, number>): number {
  if (item.cveId && aliasIndex.has(item.cveId)) return aliasIndex.get(item.cveId)!;
  if (item.ghsaId && aliasIndex.has(item.ghsaId)) return aliasIndex.get(item.ghsaId)!;
  for (const a of item.aliases) {
    if (aliasIndex.has(a)) return aliasIndex.get(a)!;
  }

  const itemTime = new Date(item.publishedAt).getTime();
  for (let i = 0; i < pool.length; i++) {
    const existing = pool[i]!;
    const dt = Math.abs(new Date(existing.publishedAt).getTime() - itemTime);
    if (dt > WINDOW_MS) continue;
    const sharedEcosystem = existing.ecosystems.some((e) => item.ecosystems.includes(e));
    if (!sharedEcosystem) continue;
    if (stringSimilarity(existing.title, item.title) >= SIMILARITY_THRESHOLD) return i;
  }
  return -1;
}

export function mergeRecords(a: Vuln, b: Vuln): Vuln {
  const aMod = new Date(a.modifiedAt).getTime();
  const bMod = new Date(b.modifiedAt).getTime();
  const newer = bMod >= aMod ? b : a;
  const older = newer === a ? b : a;

  const sources = unionBy([...a.sources, ...b.sources], (s: SourceRef) => `${s.source}:${s.externalId}`);
  const aliases = unique([...a.aliases, ...b.aliases, ...(a.cveId ? [a.cveId] : []), ...(a.ghsaId ? [a.ghsaId] : []), ...(b.cveId ? [b.cveId] : []), ...(b.ghsaId ? [b.ghsaId] : [])]);
  const ecosystems = unique([...a.ecosystems, ...b.ecosystems]) as Ecosystem[];
  const cwe = unique([...a.cwe, ...b.cwe]);
  const tags = unique([...a.tags, ...b.tags]) as Tag[];
  const affected = unionBy([...a.affected, ...b.affected], (x: Affected) => `${x.ecosystem}:${x.package}`);

  const cvss = pickMax(a.cvss, b.cvss);
  const epss = pickMax(a.epss, b.epss);
  const sevRank = Math.max(SEV_RANK[a.severity], SEV_RANK[b.severity]);
  const severity = RANK_TO_SEV[sevRank]!;
  const kev = a.kev || b.kev;

  const merged: Vuln = {
    ...newer,
    aliases,
    sources,
    ecosystems,
    cwe,
    tags,
    affected,
    severity,
    kev,
    cveId: newer.cveId ?? older.cveId,
    ghsaId: newer.ghsaId ?? older.ghsaId,
    cvssVector: newer.cvssVector ?? older.cvssVector,
    details: newer.details ?? older.details,
    publishedAt: aMod <= bMod ? a.publishedAt : b.publishedAt,
    modifiedAt: aMod >= bMod ? a.modifiedAt : b.modifiedAt,
    mergedAt: new Date().toISOString(),
  };

  if (cvss !== undefined) merged.cvss = cvss;
  if (epss !== undefined) merged.epss = epss;

  return merged;
}

function pickMax(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function unionBy<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
