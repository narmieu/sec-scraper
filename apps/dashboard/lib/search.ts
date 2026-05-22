'use client';
import Fuse from 'fuse.js';
import type { Vuln } from '@sec/shared';

let fuseInstance: Fuse<Vuln> | null = null;
let indexedFor: Vuln[] | null = null;

export function getFuse(vulns: Vuln[]): Fuse<Vuln> {
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
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: false,
  });
  indexedFor = vulns;
  return fuseInstance;
}

export function search(vulns: Vuln[], query: string): Vuln[] {
  if (!query.trim()) return vulns;
  const fuse = getFuse(vulns);
  return fuse.search(query).map((r) => r.item);
}
