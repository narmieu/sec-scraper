import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { toIndexEntry, type Vuln } from '@sec/shared';

function makeVuln(p: Partial<Vuln> = {}): Vuln {
  return {
    id: 'CVE-1', aliases: [], title: 'Title', summary: 'S', details: 'D',
    severity: 'high', cvss: 7.5, ecosystems: ['npm'], cwe: ['CWE-79'],
    affected: [
      { ecosystem: 'npm', package: 'next', versions: '<1', fixedIn: '1.0.0' },
      { ecosystem: 'npm', package: 'next', versions: '>=2 <3' },
    ],
    stackMatch: { score: 100, packages: ['next'], reason: 'direct-dep' },
    exposure: { status: 'affected', package: 'next', installed: '0.9', vulnerableRange: '<1', fixedIn: '1.0.0' },
    priority: 80, kev: true,
    publishedAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-02T00:00:00.000Z',
    mergedAt: '2026-01-02T00:00:00.000Z',
    sources: [
      { source: 'ghsa', externalId: 'g1', url: 'https://e.com/g1', fetchedAt: '2026-01-01T00:00:00.000Z' },
      { source: 'osv', externalId: 'o1', url: 'https://e.com/o1', fetchedAt: '2026-01-01T00:00:00.000Z' },
    ],
    cveId: 'CVE-1', ghsaId: 'GHSA-1', tags: ['frontend'],
    ...p,
  } as Vuln;
}

describe('toIndexEntry', () => {
  it('keeps list/filter/sort fields and reduces sources to ids', () => {
    const e = toIndexEntry(makeVuln());
    assert.equal(e.id, 'CVE-1');
    assert.equal(e.title, 'Title');
    assert.equal(e.severity, 'high');
    assert.equal(e.cvss, 7.5);
    assert.equal(e.kev, true);
    assert.equal(e.priority, 80);
    assert.deepEqual(e.sources, ['ghsa', 'osv']);
    assert.deepEqual(e.stackMatch, { score: 100, packages: ['next'], reason: 'direct-dep' });
    assert.equal(e.cveId, 'CVE-1');
    assert.equal(e.ghsaId, 'GHSA-1');
  });

  it('dedupes affectedPackages from affected[]', () => {
    const e = toIndexEntry(makeVuln());
    assert.deepEqual(e.affectedPackages, ['next']);
  });

  it('truncates summary to 160 chars', () => {
    const long = 'x'.repeat(500);
    const e = toIndexEntry(makeVuln({ summary: long }));
    assert.equal(e.summary.length, 160);
  });

  it('carries exposure as {status, fixedIn} and omits unknown', () => {
    const e = toIndexEntry(makeVuln());
    assert.deepEqual(e.exposure, { status: 'affected', fixedIn: '1.0.0' });
    const e2 = toIndexEntry(makeVuln({ exposure: { status: 'unknown' } }));
    assert.equal(e2.exposure, undefined);
  });

  it('omits optional fields when absent', () => {
    const e = toIndexEntry(makeVuln({ cveId: undefined, ghsaId: undefined, cvss: undefined, exposure: undefined }));
    assert.equal(e.cveId, undefined);
    assert.equal(e.ghsaId, undefined);
    assert.equal(e.cvss, undefined);
    assert.equal(e.exposure, undefined);
  });

  it('carries exploitMaturity (kev fallback) and patchAvailable', () => {
    const e = toIndexEntry(makeVuln({ kev: true, affected: [{ ecosystem: 'npm', package: 'x', versions: '<1', fixedIn: '1.0.0' }] }));
    assert.equal(e.exploitMaturity, 'active');
    assert.equal(e.patchAvailable, true);
    const none = toIndexEntry(makeVuln({ kev: false, exploit: undefined, affected: [{ ecosystem: 'npm', package: 'x', versions: '<1' }] }));
    assert.equal(none.exploitMaturity, undefined);
    assert.equal(none.patchAvailable, false);
  });
});
