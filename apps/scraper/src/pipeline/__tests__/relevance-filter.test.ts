import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildStackIndex, type Stack } from '@sec/shared';
import {
  filterByRelevance,
  ICS_VENDOR_BLOCKLIST,
  STACK_ECOSYSTEM_KEYWORDS,
} from '../relevance-filter.js';
import type { SourceKind } from '../../adapters/types.js';
import type { Vuln } from '@sec/shared';

const stack: Stack = {
  frontend: { next: '14.0.0', react: '18.0.0', lodash: '4.17.21', '@apollo/client': '3.0.0' },
  backend: { 'symfony/symfony': '^6.4', 'doctrine/orm': '^2.19' },
  tools: { claude: '*' },
};
const idx = buildStackIndex(stack);

function makeVuln(partial: Partial<Vuln> & { sources?: Vuln['sources'] } = {}): Vuln {
  return {
    id: partial.id ?? 'TEST-1',
    aliases: partial.aliases ?? [],
    title: partial.title ?? '',
    summary: partial.summary ?? '',
    severity: partial.severity ?? 'unknown',
    ecosystems: partial.ecosystems ?? [],
    cwe: partial.cwe ?? [],
    affected: partial.affected ?? [],
    stackMatch: partial.stackMatch ?? { score: 0, packages: [], reason: 'topic-mention' },
    priority: partial.priority ?? 0,
    kev: partial.kev ?? false,
    publishedAt: partial.publishedAt ?? '2026-05-24T00:00:00.000Z',
    modifiedAt: partial.modifiedAt ?? '2026-05-24T00:00:00.000Z',
    mergedAt: partial.mergedAt ?? '2026-05-24T00:00:00.000Z',
    sources: partial.sources ?? [
      { source: 'test', externalId: 'test-1', url: 'https://example.com', fetchedAt: '2026-05-24T00:00:00.000Z' },
    ],
    tags: partial.tags ?? [],
  } as Vuln;
}

describe('filterByRelevance: advisory and changelog always pass', () => {
  for (const kind of ['advisory', 'changelog'] as const) {
    it(`passes any ${kind} item regardless of content`, () => {
      const v = makeVuln({ title: 'random product launch with nothing relevant' });
      const verdict = filterByRelevance(v, kind as SourceKind, idx);
      assert.equal(verdict.keep, true);
    });
  }
});

describe('filterByRelevance: news kind requires relevance signal', () => {
  it('keeps news mentioning a CVE id', () => {
    const v = makeVuln({ title: 'CVE-2026-12345 critical RCE in obscure tool', summary: '' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, true);
  });
  it('keeps news mentioning a stack package by name', () => {
    const v = makeVuln({ title: 'lodash prototype pollution found', summary: '' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, true);
  });
  it('keeps news mentioning an ecosystem keyword', () => {
    const v = makeVuln({ title: 'Malicious npm packages drop infostealers', summary: '' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, true);
  });
  it('drops news with no signal', () => {
    const v = makeVuln({ title: 'Botnet operator arrested in Canada', summary: 'Police made an arrest.' });
    const verdict = filterByRelevance(v, 'news', idx);
    assert.equal(verdict.keep, false);
  });
  it('drops off-stack CVE-less reports', () => {
    const v = makeVuln({ title: 'Drupal critical SQL injection flaw', summary: 'Attackers actively exploiting.' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, false);
  });
});

describe('filterByRelevance: research kind', () => {
  it('drops arxiv-cs-cr unconditionally even when content mentions stack', () => {
    const v = makeVuln({
      title: 'Adversarial attacks on Claude and React-based agents',
      sources: [{ source: 'arxiv-cs-cr', externalId: 'x', url: 'https://x', fetchedAt: '2026-05-24T00:00:00.000Z' }],
    });
    assert.equal(filterByRelevance(v, 'research', idx).keep, false);
  });
  it('keeps project-zero items mentioning a stack ecosystem', () => {
    const v = makeVuln({
      title: 'A new attack on the V8 engine that powers Node.js',
      sources: [{ source: 'project-zero', externalId: 'p', url: 'https://x', fetchedAt: '2026-05-24T00:00:00.000Z' }],
    });
    assert.equal(filterByRelevance(v, 'research', idx).keep, true);
  });
  it('drops project-zero items with no stack signal', () => {
    const v = makeVuln({
      title: '0-click exploit chain for the Pixel 10',
      sources: [{ source: 'project-zero', externalId: 'p', url: 'https://x', fetchedAt: '2026-05-24T00:00:00.000Z' }],
    });
    assert.equal(filterByRelevance(v, 'research', idx).keep, false);
  });
  it('keeps github-security-lab items with CVE', () => {
    const v = makeVuln({
      title: 'CVE-2026-99999 found via CodeQL',
      sources: [{ source: 'github-security-lab', externalId: 'g', url: 'https://x', fetchedAt: '2026-05-24T00:00:00.000Z' }],
    });
    assert.equal(filterByRelevance(v, 'research', idx).keep, true);
  });
});

describe('filterByRelevance: alert kind uses ICS blocklist', () => {
  it('drops items led by an ICS vendor name', () => {
    for (const vendor of ICS_VENDOR_BLOCKLIST) {
      const v = makeVuln({ title: `${vendor} industrial controller flaw`, summary: '' });
      assert.equal(filterByRelevance(v, 'alert', idx).keep, false, `expected drop for ${vendor}`);
    }
  });
  it('keeps general CISA bulletins', () => {
    const v = makeVuln({ title: 'CISA Adds One Known Exploited Vulnerability to Catalog', summary: '' });
    assert.equal(filterByRelevance(v, 'alert', idx).keep, true);
  });
});

describe('filterByRelevance: word-boundary edge cases', () => {
  it('does not match "react" inside "reactor"', () => {
    const v = makeVuln({ title: 'nuclear reactor security incident' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, false);
  });
  it('does not match "npm" inside "npms"', () => {
    const v = makeVuln({ title: 'npms.io directory changes' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, false);
  });
  it('matches scoped package via unscoped tail', () => {
    const v = makeVuln({ title: 'Apollo Client memory leak fixed' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, true);
  });
});

describe('exports', () => {
  it('exports STACK_ECOSYSTEM_KEYWORDS', () => {
    assert.ok(STACK_ECOSYSTEM_KEYWORDS.length > 0);
  });
  it('exports ICS_VENDOR_BLOCKLIST', () => {
    assert.ok(ICS_VENDOR_BLOCKLIST.length > 0);
  });
});
