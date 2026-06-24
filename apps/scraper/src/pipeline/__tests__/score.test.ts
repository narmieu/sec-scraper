import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Vuln } from '@sec/shared';
import { scoreWithBreakdown } from '../score.js';

// publishedAt in 2020 keeps freshness at 0 so totals are deterministic.
function v(partial: Partial<Vuln>): Vuln {
  return {
    id: 'CVE-X', aliases: [], title: 't', summary: '', severity: 'high',
    ecosystems: [], cwe: [], affected: [],
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0, kev: false,
    publishedAt: '2020-01-01T00:00:00.000Z', modifiedAt: '2020-01-01T00:00:00.000Z',
    mergedAt: '2020-01-01T00:00:00.000Z',
    sources: [{ source: 's', externalId: 'x', url: 'https://e.com', fetchedAt: '2020-01-01T00:00:00.000Z' }],
    tags: [],
    ...partial,
  } as Vuln;
}

describe('scoreWithBreakdown: exposure verdict', () => {
  it('demotes a safe high-severity vuln', () => {
    // base 30 (high) + 20*0.35 (stackMatch) = 37, then *0.25 safe demote -> 9.
    const r = scoreWithBreakdown(v({
      severity: 'high',
      stackMatch: { score: 20, packages: ['next'], reason: 'direct-dep' },
      exposure: { status: 'safe' },
    }));
    assert.equal(r.demoted, true);
    assert.equal(r.total, 9);
  });

  it('floors an affected high-severity vuln to the alert bar (80)', () => {
    // base 30 + 100*0.35 + 8 no-patch bump = 73, floored up to 80.
    const r = scoreWithBreakdown(v({
      severity: 'high',
      stackMatch: { score: 100, packages: ['lodash'], reason: 'direct-dep' },
      exposure: { status: 'affected' },
    }));
    assert.equal(r.total, 80);
    assert.equal(r.floorApplied, 'affected');
  });

  it('leaves a potential vuln undemoted', () => {
    const r = scoreWithBreakdown(v({
      severity: 'high',
      stackMatch: { score: 60, packages: ['symfony/symfony'], reason: 'direct-dep' },
      exposure: { status: 'potential' },
    }));
    assert.equal(r.demoted, false);
  });

  it('still demotes a fully irrelevant vuln (stackMatch 0, not ai-llm)', () => {
    const r = scoreWithBreakdown(v({ severity: 'high', exposure: { status: 'unknown' } }));
    assert.equal(r.demoted, true);
  });

  it('KEV floor still applies', () => {
    const r = scoreWithBreakdown(v({ severity: 'low', kev: true, exposure: { status: 'unknown' } }));
    assert.equal(r.total, 85);
    assert.equal(r.floorApplied, 'kev');
  });
});

describe('scoreWithBreakdown: exploit maturity + patch', () => {
  it('weaponized scores above poc', () => {
    const w = scoreWithBreakdown(v({ severity: 'medium', exploit: { maturity: 'weaponized', refs: [] } }));
    const p = scoreWithBreakdown(v({ severity: 'medium', exploit: { maturity: 'poc', refs: [] } }));
    assert.ok(w.total > p.total);
  });
  it('kev still implies active even with no exploit field', () => {
    const r = scoreWithBreakdown(v({ severity: 'medium', kev: true }));
    // active(20) makes exploit big; KEV floor also applies -> 85
    assert.equal(r.total, 85);
  });
  it('affected + no patch gets the bump vs affected + patched', () => {
    const noPatch = scoreWithBreakdown(v({ severity: 'high', exposure: { status: 'affected' },
      stackMatch: { score: 100, packages: ['x'], reason: 'direct-dep' }, affected: [{ ecosystem: 'npm', package: 'x', versions: '<1' }] }));
    const patched = scoreWithBreakdown(v({ severity: 'high', exposure: { status: 'affected' },
      stackMatch: { score: 100, packages: ['x'], reason: 'direct-dep' }, affected: [{ ecosystem: 'npm', package: 'x', versions: '<1', fixedIn: '1.0.0' }] }));
    assert.ok(noPatch.total >= patched.total);
  });
});
