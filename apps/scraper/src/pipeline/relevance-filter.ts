import type { StackIndex, Vuln } from '@sec/shared';
import type { SourceKind } from '../adapters/types.js';

export type FilterVerdict = { keep: true } | { keep: false; reason: string };

export const STACK_ECOSYSTEM_KEYWORDS: readonly string[] = [
  'npm',
  'composer',
  'symfony',
  'next.js',
  'nextjs',
  'react',
  'vercel',
  'cloudflare',
  'claude',
  'anthropic',
  'openai',
  'php',
  'node.js',
  'nodejs',
];

export const ICS_VENDOR_BLOCKLIST: readonly string[] = [
  'siemens',
  'abb',
  'hitachi',
  'schneider',
  'honeywell',
  'rockwell',
  'mitsubishi',
  'dahua',
  'delta electronics',
  'phoenix contact',
  'wago',
  'beckhoff',
  'omron',
  'yokogawa',
  'emerson',
  'ge digital',
  'ge industrial',
  'allen-bradley',
  'advantech',
  'moxa',
  'opto 22',
];

const CVE_REGEX = /cve-\d{4}-\d+/i;
const MIN_PACKAGE_NAME_LEN = 3;

export function filterByRelevance(
  vuln: Vuln,
  kind: SourceKind,
  stack: StackIndex,
): FilterVerdict {
  switch (kind) {
    case 'advisory':
    case 'changelog':
      return { keep: true };

    case 'news':
      return hasRelevanceSignal(vuln, stack)
        ? { keep: true }
        : { keep: false, reason: 'news: no CVE id, stack package, or ecosystem keyword' };

    case 'research': {
      const sourceId = vuln.sources[0]?.source;
      if (sourceId === 'arxiv-cs-cr') {
        return { keep: false, reason: 'research: arxiv-cs-cr is unconditionally dropped' };
      }
      return hasRelevanceSignal(vuln, stack)
        ? { keep: true }
        : { keep: false, reason: 'research: no CVE id, stack package, or ecosystem keyword' };
    }

    case 'alert':
      return mentionsBlocklistedVendor(vuln)
        ? { keep: false, reason: 'alert: ICS/OT vendor in blocklist' }
        : { keep: true };
  }
}

function hasRelevanceSignal(vuln: Vuln, stack: StackIndex): boolean {
  const haystack = `${vuln.title}\n${vuln.summary}`.toLowerCase();

  if (CVE_REGEX.test(haystack)) return true;

  for (const keyword of STACK_ECOSYSTEM_KEYWORDS) {
    if (containsWord(haystack, keyword.toLowerCase())) return true;
  }

  for (const name of stack.allLower) {
    if (name.length < MIN_PACKAGE_NAME_LEN) continue;
    if (containsWord(haystack, name)) return true;

    // Scoped/namespaced packages: also try the unscoped tail.
    // e.g. "@apollo/client" -> "client"; "symfony/symfony" -> "symfony".
    const tail = unscopedTail(name);
    if (tail && tail.length >= MIN_PACKAGE_NAME_LEN && tail !== name) {
      if (containsWord(haystack, tail)) return true;
    }
  }

  return false;
}

function mentionsBlocklistedVendor(vuln: Vuln): boolean {
  const haystack = `${vuln.title} ${vuln.summary}`.toLowerCase();
  return ICS_VENDOR_BLOCKLIST.some((vendor) => containsWord(haystack, vendor));
}

function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  let idx = 0;
  while (idx < haystack.length) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) return false;
    const before = found === 0 ? '' : haystack[found - 1] ?? '';
    const afterIdx = found + needle.length;
    const after = afterIdx >= haystack.length ? '' : haystack[afterIdx] ?? '';
    if (!isWordChar(before) && !isWordChar(after)) return true;
    idx = found + 1;
  }
  return false;
}

function isWordChar(ch: string): boolean {
  if (!ch) return false;
  return /[a-z0-9]/i.test(ch);
}

function unscopedTail(name: string): string {
  const slash = name.lastIndexOf('/');
  if (slash === -1) return '';
  return name.slice(slash + 1);
}
