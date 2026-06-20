'use client';
import Fuse from 'fuse.js';
import type { IndexEntry } from '@sec/shared';

let fuseInstance: Fuse<IndexEntry> | null = null;
let indexedFor: IndexEntry[] | null = null;

function getFuse(vulns: IndexEntry[]): Fuse<IndexEntry> {
  if (fuseInstance && indexedFor === vulns) return fuseInstance;
  fuseInstance = new Fuse(vulns, {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'summary', weight: 1 },
      { name: 'cveId', weight: 1.5 },
      { name: 'ghsaId', weight: 1.5 },
      { name: 'affectedPackages', weight: 1.5 },
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

function substringMatches(vulns: IndexEntry[], q: string): IndexEntry[] {
  const needle = q.toLowerCase();
  const out: IndexEntry[] = [];
  for (const v of vulns) {
    if (v.title.toLowerCase().includes(needle)) {
      out.push(v);
      continue;
    }
    if (v.cveId?.toLowerCase().includes(needle) || v.ghsaId?.toLowerCase().includes(needle)) {
      out.push(v);
      continue;
    }
    if (v.affectedPackages.some((p) => p.toLowerCase().includes(needle))) {
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

export function search(vulns: IndexEntry[], query: string): IndexEntry[] {
  const q = query.trim();
  if (!q) return vulns;
  const exact = substringMatches(vulns, q);
  if (exact.length > 0) return exact;
  return getFuse(vulns).search(q).map((r) => r.item);
}
