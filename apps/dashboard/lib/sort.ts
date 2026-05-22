import type { Severity, Vuln } from '@sec/shared';
import type { SortKey } from './store';

const SEV_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

const COMPARATORS: Record<SortKey, (a: Vuln, b: Vuln) => number> = {
  'priority-desc': (a, b) => b.priority - a.priority || b.publishedAt.localeCompare(a.publishedAt),
  'priority-asc': (a, b) => a.priority - b.priority || b.publishedAt.localeCompare(a.publishedAt),
  'published-desc': (a, b) => b.publishedAt.localeCompare(a.publishedAt),
  'published-asc': (a, b) => a.publishedAt.localeCompare(b.publishedAt),
  'modified-desc': (a, b) => b.modifiedAt.localeCompare(a.modifiedAt),
  'severity-desc': (a, b) =>
    SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.priority - a.priority,
  'cvss-desc': (a, b) => (b.cvss ?? -1) - (a.cvss ?? -1) || b.priority - a.priority,
  'stackmatch-desc': (a, b) =>
    b.stackMatch.score - a.stackMatch.score || b.priority - a.priority,
};

export function sortVulns(vulns: Vuln[], key: SortKey): Vuln[] {
  return [...vulns].sort(COMPARATORS[key]);
}
