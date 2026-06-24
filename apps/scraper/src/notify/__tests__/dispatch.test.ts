import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AlertedFile, AlertEntry, Vuln } from '@sec/shared';
import { pickAlerts } from '../dispatch.js';

const NOW = new Date('2026-06-24T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

// Meets the push bar (priority >= 80, stackMatch >= 60) and is freshly
// published by default; individual tests override what they exercise.
function v(partial: Partial<Vuln> = {}): Vuln {
  return {
    id: 'CVE-1',
    aliases: [],
    title: 't',
    summary: '',
    severity: 'critical',
    ecosystems: [],
    cwe: [],
    affected: [],
    stackMatch: { score: 100, packages: ['next'], reason: 'direct-dep' },
    priority: 90,
    kev: false,
    publishedAt: hoursAgo(1),
    modifiedAt: hoursAgo(1),
    mergedAt: hoursAgo(1),
    sources: [{ source: 's', externalId: 'x', url: 'https://e.com', fetchedAt: hoursAgo(1) }],
    tags: [],
    ...partial,
  } as Vuln;
}

function entry(partial: Partial<AlertEntry> = {}): AlertEntry {
  return {
    alertedAt: hoursAgo(48),
    channels: { teams: 'ok' },
    vulnSnapshot: { priority: 90, kev: false, severity: 'critical' },
    ...partial,
  };
}

describe('pickAlerts: freshness gate', () => {
  it('suppresses a stale non-KEV vuln that newly crosses the bar', () => {
    // The reported bug: a Next.js CVE published ~1.5y ago, never alerted,
    // newly matching the rebuilt stack manifest. Must NOT fire.
    const out = pickAlerts([v({ publishedAt: hoursAgo(13_000) })], {}, NOW);
    assert.equal(out.length, 0);
  });

  it('fires for a freshly published vuln', () => {
    const out = pickAlerts([v({ publishedAt: hoursAgo(2) })], {}, NOW);
    assert.equal(out.length, 1);
  });

  it('fires for a stale KEV vuln (active exploitation is age-independent)', () => {
    const out = pickAlerts([v({ publishedAt: hoursAgo(13_000), kev: true })], {}, NOW);
    assert.equal(out.length, 1);
  });

  it('fires for a vuln published 47h ago but not one published 49h ago', () => {
    assert.equal(pickAlerts([v({ publishedAt: hoursAgo(47) })], {}, NOW).length, 1);
    assert.equal(pickAlerts([v({ publishedAt: hoursAgo(49) })], {}, NOW).length, 0);
  });

  it('ignores vulns below the priority/stackMatch bar', () => {
    assert.equal(pickAlerts([v({ priority: 10 })], {}, NOW).length, 0);
    assert.equal(pickAlerts([v({ stackMatch: { score: 5, packages: [], reason: 'topic-mention' } })], {}, NOW).length, 0);
  });

  it('retries a fresh prior alert with a failed channel', () => {
    const alerted: AlertedFile = { 'CVE-1': entry({ channels: { teams: 'fail:HTTP 500' } }) };
    const out = pickAlerts([v({ publishedAt: hoursAgo(2) })], alerted, NOW);
    assert.equal(out.length, 1);
  });

  it('does NOT retry a stale non-KEV failed alert (max-age applies to re-fires too)', () => {
    const alerted: AlertedFile = { 'CVE-1': entry({ channels: { teams: 'fail:HTTP 500' } }) };
    const out = pickAlerts([v({ publishedAt: hoursAgo(13_000) })], alerted, NOW);
    assert.equal(out.length, 0);
  });

  it('still retries a stale KEV failed alert (active exploitation is age-independent)', () => {
    const alerted: AlertedFile = {
      'CVE-1': entry({
        channels: { teams: 'fail:HTTP 500' },
        vulnSnapshot: { priority: 90, kev: true, severity: 'critical' },
      }),
    };
    const out = pickAlerts([v({ publishedAt: hoursAgo(13_000), kev: true })], alerted, NOW);
    assert.equal(out.length, 1);
  });

  it('does not re-alert a fully-delivered prior', () => {
    const alerted: AlertedFile = { 'CVE-1': entry({ channels: { teams: 'ok' } }) };
    const out = pickAlerts([v()], alerted, NOW);
    assert.equal(out.length, 0);
  });

  it('sends a KEV follow-up for an already-alerted vuln that just became KEV', () => {
    const alerted: AlertedFile = {
      'CVE-1': entry({ vulnSnapshot: { priority: 90, kev: false, severity: 'critical' } }),
    };
    const out = pickAlerts([v({ publishedAt: hoursAgo(13_000), kev: true })], alerted, NOW);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.isKevFollowup, true);
  });
});

describe('pickAlerts: withdrawn advisories', () => {
  it('never alerts a withdrawn advisory, even fresh and over the bar', () => {
    const out = pickAlerts([v({ withdrawn: true, publishedAt: hoursAgo(1) })], {}, NOW);
    assert.equal(out.length, 0);
  });

  it('never alerts a withdrawn advisory even when it is KEV', () => {
    const out = pickAlerts([v({ withdrawn: true, kev: true, publishedAt: hoursAgo(1) })], {}, NOW);
    assert.equal(out.length, 0);
  });

  it('does not retry a withdrawn advisory that has a prior failed channel', () => {
    const alerted: AlertedFile = { 'CVE-1': entry({ channels: { teams: 'fail:HTTP 500' } }) };
    const out = pickAlerts([v({ withdrawn: true, publishedAt: hoursAgo(2) })], alerted, NOW);
    assert.equal(out.length, 0);
  });
});
