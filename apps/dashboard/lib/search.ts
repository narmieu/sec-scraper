'use client';
import Fuse from 'fuse.js';
import type { Vuln } from '@sec/shared';

let fuseInstance: Fuse<Vuln> | null = null;
let indexedFor: Vuln[] | null = null;

function getFuse(vulns: Vuln[]): Fuse<Vuln> {
  if (fuseInstance && indexedFor === vulns) return fuseInstance;
  fuseInstance = new Fuse(vulns, {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'summary', weight: 1 },
      { name: 'cveId', weight: 1.5 },
      { name: 'ghsaId', weight: 1.5 },
      { name: 'affected.package', weight: 1.5 },
      { name: 'stackMatch.packages', weight: 1.5 },
    ],
    threshold: 0.2,
    minMatchCharLength: 3,
    ignoreLocation: true,
    useExtendedSearch: false,
  });
  indexedFor = vulns;
  return fuseInstance;
}

function substringMatches(vulns: Vuln[], q: string): Vuln[] {
  const needle = q.toLowerCase();
  const out: Vuln[] = [];
  for (const v of vulns) {
    if (v.title.toLowerCase().includes(needle)) {
      out.push(v);
      continue;
    }
    if (v.cveId?.toLowerCase().includes(needle) || v.ghsaId?.toLowerCase().includes(needle)) {
      out.push(v);
      continue;
    }
    if (v.affected.some((a) => a.package.toLowerCase().includes(needle))) {
      out.push(v);
      continue;
    }
    if (v.stackMatch.packages.some((p) => p.toLowerCase().includes(needle))) {
      out.push(v);
      continue;
    }
    if (v.summary.toLowerCase().includes(needle)) {
      out.push(v);
    }
  }
  return out;
}

export function search(vulns: Vuln[], query: string): Vuln[] {
  const q = query.trim();
  if (!q) return vulns;
  // Substring scan first — fast and intuitive for exact package/CVE names.
  const exact = substringMatches(vulns, q);
  if (exact.length > 0) return exact;
  // Fall back to fuzzy match for typos or partial keywords.
  return getFuse(vulns).search(q).map((r) => r.item);
}
