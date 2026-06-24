import type { Stack, StackMatch, Vuln } from './schemas';
import { evaluateExposure } from './exposure';

export interface StackIndex {
  byName: Map<string, string[]>;
  allLower: string[];
  originalCase: Map<string, string>;
}

export function buildStackIndex(stack: Stack): StackIndex {
  const byName = new Map<string, string[]>();
  const originalCase = new Map<string, string>();
  for (const category of [stack.frontend, stack.backend, stack.tools]) {
    for (const [pkg, version] of Object.entries(category)) {
      const k = pkg.toLowerCase();
      byName.set(k, Array.isArray(version) ? version : [version]);
      originalCase.set(k, pkg);
    }
  }
  return { byName, allLower: [...byName.keys()], originalCase };
}

export function scoreStackMatch(vuln: Vuln, idx: StackIndex): StackMatch {
  return evaluateExposure(vuln, idx).stackMatch;
}
