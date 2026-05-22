import semver from 'semver';
import type { Stack, StackMatch, Vuln } from './schemas';

export interface StackIndex {
  byName: Map<string, string>;
  allLower: string[];
  originalCase: Map<string, string>;
}

export function buildStackIndex(stack: Stack): StackIndex {
  const byName = new Map<string, string>();
  const originalCase = new Map<string, string>();
  for (const category of [stack.frontend, stack.backend, stack.tools]) {
    for (const [pkg, version] of Object.entries(category)) {
      const k = pkg.toLowerCase();
      byName.set(k, version);
      originalCase.set(k, pkg);
    }
  }
  return { byName, allLower: [...byName.keys()], originalCase };
}

export function scoreStackMatch(vuln: Vuln, idx: StackIndex): StackMatch {
  for (const aff of vuln.affected) {
    const key = aff.package.toLowerCase();
    const installed = idx.byName.get(key);
    if (!installed) continue;
    const original = idx.originalCase.get(key) ?? aff.package;
    if (installed === '*' || versionSatisfies(installed, aff.versions)) {
      return { score: 100, packages: [original], reason: 'direct-dep' };
    }
    return { score: 60, packages: [original], reason: 'direct-dep' };
  }

  const haystack = `${vuln.title}\n${vuln.summary}`.toLowerCase();
  const mentions: string[] = [];
  for (const name of idx.allLower) {
    if (name.length < 4) continue;
    if (haystack.includes(name)) {
      mentions.push(idx.originalCase.get(name) ?? name);
    }
  }
  if (mentions.length > 0) {
    return { score: 40, packages: mentions, reason: 'topic-mention' };
  }
  return { score: 0, packages: [], reason: 'topic-mention' };
}

function versionSatisfies(installed: string, range: string): boolean {
  if (!range || range === 'any' || range === '*') return true;
  const normalized = range.replace(/,\s*/g, ' || ');
  const cleanInstalled = semver.coerce(installed)?.version ?? installed;
  try {
    return semver.satisfies(cleanInstalled, normalized, { includePrerelease: true });
  } catch {
    return false;
  }
}
