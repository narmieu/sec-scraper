import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Vuln } from '@sec/shared';
import { dedupeMerge } from '../dedupe.js';

function v(partial: Partial<Vuln>): Vuln {
  return {
    id: 'x',
    aliases: [],
    title: 'title',
    summary: '',
    severity: 'high',
    ecosystems: ['npm'],
    cwe: [],
    affected: [],
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0,
    kev: false,
    publishedAt: '2026-06-10T00:00:00.000Z',
    modifiedAt: '2026-06-10T00:00:00.000Z',
    mergedAt: '2026-06-10T00:00:00.000Z',
    sources: [{ source: 's', externalId: 'e', url: 'https://e.com', fetchedAt: '2026-06-10T00:00:00.000Z' }],
    tags: [],
    ...partial,
  } as Vuln;
}

describe('dedupeMerge', () => {
  it('merges two records sharing a cveId (alias fast-path)', () => {
    const out = dedupeMerge([
      v({ id: 'CVE-2026-1', cveId: 'CVE-2026-1', aliases: ['CVE-2026-1'], sources: [{ source: 'a', externalId: '1', url: 'https://a', fetchedAt: '2026-06-10T00:00:00.000Z' }] }),
      v({ id: 'CVE-2026-1', cveId: 'CVE-2026-1', aliases: ['CVE-2026-1'], sources: [{ source: 'b', externalId: '2', url: 'https://b', fetchedAt: '2026-06-10T00:00:00.000Z' }] }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.sources.length, 2);
  });

  it('keeps records with distinct cve ids separate even when titles match', () => {
    const title = 'Remote code execution in the widget parser';
    const out = dedupeMerge([
      v({ id: 'CVE-2026-1', cveId: 'CVE-2026-1', aliases: ['CVE-2026-1'], title }),
      v({ id: 'CVE-2026-2', cveId: 'CVE-2026-2', aliases: ['CVE-2026-2'], title }),
    ]);
    assert.equal(out.length, 2);
  });

  it('still fuzzy-merges id-less items with near-identical titles in the same ecosystem/window', () => {
    const out = dedupeMerge([
      v({ id: 'n1', title: 'Critical XSS in the admin dashboard login form' }),
      v({ id: 'n2', title: 'Critical XSS in the admin dashboard login form!' }),
    ]);
    assert.equal(out.length, 1);
  });

  it('does not merge id-less items with dissimilar titles', () => {
    const out = dedupeMerge([
      v({ id: 'n1', title: 'XSS in the admin dashboard' }),
      v({ id: 'n2', title: 'Completely unrelated denial of service in the scheduler' }),
    ]);
    assert.equal(out.length, 2);
  });
});
