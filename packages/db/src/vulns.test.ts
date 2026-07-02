import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Vuln } from '@sec/shared';
import { createClient } from './client.js';
import { migrateSchema } from './schema.js';
import { vulnToRow } from './serialize.js';
import { upsertVulns, loadLiveVulns, loadVulnsByKeys, getVuln, selectChanged, deleteVulns } from './vulns.js';

// Fully-specified so round-trip deep-equality has no absent-vs-undefined ambiguity.
function makeVuln(p: Partial<Vuln> = {}): Vuln {
  return {
    id: 'CVE-2026-1',
    cveId: 'CVE-2026-1',
    ghsaId: 'GHSA-aaaa-bbbb-cccc',
    aliases: ['GHSA-aaaa-bbbb-cccc'],
    title: 'Example vuln',
    summary: 'A summary',
    details: 'Some details',
    severity: 'high',
    cvss: 7.5,
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
    epss: 0.42,
    kev: true,
    ecosystems: ['npm'],
    cwe: ['CWE-79'],
    affected: [{ ecosystem: 'npm', package: 'next', versions: '<1', fixedIn: '1.0.0' }],
    stackMatch: { score: 100, packages: ['next'], reason: 'direct-dep' },
    exposure: {
      status: 'affected',
      package: 'next',
      ecosystem: 'npm',
      installed: '0.9',
      vulnerableRange: '<1',
      fixedIn: '1.0.0',
    },
    exploit: { maturity: 'poc', refs: [{ source: 'exploit-db', url: 'https://e.com/x' }] },
    priority: 80,
    publishedAt: '2026-06-01T00:00:00.000Z',
    modifiedAt: '2026-06-10T00:00:00.000Z',
    mergedAt: '2026-06-10T00:00:00.000Z',
    sources: [{ source: 'ghsa', externalId: 'g1', url: 'https://e.com/g1', fetchedAt: '2026-06-01T00:00:00.000Z' }],
    tags: ['frontend'],
    ...p,
  };
}

async function freshDb() {
  const db = createClient(':memory:');
  await migrateSchema(db);
  return db;
}

// Persistence is JSON-backed, so equality is semantic: an absent optional and an
// explicit `undefined` are the same fact. Normalize both sides through JSON.
const norm = (x: unknown) => JSON.parse(JSON.stringify(x));

describe('vulnToRow / rowToVuln', () => {
  it('round-trips a fully-specified Vuln through a DB row', async () => {
    const db = await freshDb();
    const v = makeVuln();
    await upsertVulns(db, [v]);
    const [loaded] = await loadLiveVulns(db, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(norm(loaded), norm(v));
  });

  it('round-trips a minimal Vuln (optionals absent)', async () => {
    const db = await freshDb();
    const v = makeVuln({
      cveId: undefined,
      ghsaId: undefined,
      details: undefined,
      cvss: undefined,
      cvssVector: undefined,
      epss: undefined,
      exposure: undefined,
      exploit: undefined,
    });
    await upsertVulns(db, [v]);
    const got = await getVuln(db, v.id);
    assert.deepEqual(norm(got), norm(v));
  });

  it('vulnToRow denormalizes exploit maturity and exposure status into columns', () => {
    const row = vulnToRow(makeVuln());
    assert.equal(row.exploit_maturity, 'poc');
    assert.equal(row.exposure_status, 'affected');
    assert.equal(row.kev, 1);
  });

  it('persists and reloads the withdrawn flag', async () => {
    const db = await freshDb();
    await upsertVulns(db, [makeVuln({ withdrawn: true })]);
    const got = await getVuln(db, 'CVE-2026-1');
    assert.equal(got?.withdrawn, true);
  });
});

describe('upsertVulns', () => {
  it('updates in place on id conflict (no duplicate rows)', async () => {
    const db = await freshDb();
    await upsertVulns(db, [makeVuln({ title: 'old' })]);
    await upsertVulns(db, [makeVuln({ title: 'new' })]);
    const all = await loadLiveVulns(db, '2026-01-01T00:00:00.000Z');
    assert.equal(all.length, 1);
    assert.equal(all[0]!.title, 'new');
  });
});

describe('loadLiveVulns', () => {
  it('returns only rows at/after the cutoff, sorted by priority desc', async () => {
    const db = await freshDb();
    await upsertVulns(db, [
      makeVuln({ id: 'A', cveId: undefined, ghsaId: undefined, priority: 50, modifiedAt: '2026-06-10T00:00:00.000Z' }),
      makeVuln({ id: 'B', cveId: undefined, ghsaId: undefined, priority: 90, modifiedAt: '2026-06-11T00:00:00.000Z' }),
      makeVuln({ id: 'OLD', cveId: undefined, ghsaId: undefined, priority: 99, modifiedAt: '2020-01-01T00:00:00.000Z' }),
    ]);
    const live = await loadLiveVulns(db, '2026-03-23T00:00:00.000Z');
    assert.deepEqual(live.map((v) => v.id), ['B', 'A']);
  });

  it('excludes withdrawn advisories from the live set', async () => {
    const db = await freshDb();
    await upsertVulns(db, [
      makeVuln({ id: 'LIVE', cveId: undefined, ghsaId: undefined }),
      makeVuln({ id: 'GONE', cveId: undefined, ghsaId: undefined, withdrawn: true }),
    ]);
    const live = await loadLiveVulns(db, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(live.map((v) => v.id), ['LIVE']);
  });
});

describe('loadVulnsByKeys', () => {
  const CUTOFF = '2026-01-01T00:00:00.000Z';

  it('matches on id, cve_id, or ghsa_id and dedupes by id', async () => {
    const db = await freshDb();
    await upsertVulns(db, [
      makeVuln({ id: 'CVE-2026-1', cveId: 'CVE-2026-1', ghsaId: 'GHSA-1111-1111-1111', aliases: [] }),
      makeVuln({ id: 'CVE-2026-2', cveId: 'CVE-2026-2', ghsaId: undefined, aliases: [] }),
      makeVuln({ id: 'GHSA-xxxx-yyyy-zzzz', cveId: undefined, ghsaId: 'GHSA-xxxx-yyyy-zzzz', aliases: [] }),
      makeVuln({ id: 'CVE-2026-9', cveId: 'CVE-2026-9', ghsaId: undefined, aliases: [] }),
    ]);
    // id match (CVE-2026-1 also matches its own ghsa — must not duplicate),
    // cve_id match (CVE-2026-2), ghsa_id match (GHSA-xxxx...). CVE-2026-9 absent.
    const got = await loadVulnsByKeys(
      db,
      ['CVE-2026-1', 'GHSA-1111-1111-1111', 'CVE-2026-2', 'GHSA-xxxx-yyyy-zzzz', 'not-present'],
      CUTOFF,
    );
    assert.deepEqual(got.map((v) => v.id).sort(), ['CVE-2026-1', 'CVE-2026-2', 'GHSA-xxxx-yyyy-zzzz']);
  });

  it('applies the live filter (excludes withdrawn and pre-cutoff rows)', async () => {
    const db = await freshDb();
    await upsertVulns(db, [
      makeVuln({ id: 'LIVE', cveId: 'CVE-L', ghsaId: undefined, aliases: [] }),
      makeVuln({ id: 'GONE', cveId: 'CVE-G', ghsaId: undefined, aliases: [], withdrawn: true }),
      makeVuln({ id: 'OLD', cveId: 'CVE-O', ghsaId: undefined, aliases: [], modifiedAt: '2020-01-01T00:00:00.000Z' }),
    ]);
    const got = await loadVulnsByKeys(db, ['CVE-L', 'CVE-G', 'CVE-O'], CUTOFF);
    assert.deepEqual(got.map((v) => v.id), ['LIVE']);
  });

  it('returns [] for no identifiers', async () => {
    const db = await freshDb();
    await upsertVulns(db, [makeVuln({ id: 'A' })]);
    assert.deepEqual(await loadVulnsByKeys(db, [], CUTOFF), []);
  });
});

describe('getVuln', () => {
  it('returns null for a missing id', async () => {
    const db = await freshDb();
    assert.equal(await getVuln(db, 'nope'), null);
  });
});

describe('deleteVulns', () => {
  it('removes rows by id and ignores unknown ids', async () => {
    const db = await freshDb();
    await upsertVulns(db, [makeVuln({ id: 'A' }), makeVuln({ id: 'B' })]);
    await deleteVulns(db, ['A', 'nonexistent']);
    const live = await loadLiveVulns(db, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(live.map((v) => v.id), ['B']);
  });

  it('no-ops on an empty id list', async () => {
    const db = await freshDb();
    await upsertVulns(db, [makeVuln({ id: 'A' })]);
    await deleteVulns(db, []);
    const live = await loadLiveVulns(db, '2026-01-01T00:00:00.000Z');
    assert.equal(live.length, 1);
  });
});

describe('selectChanged', () => {
  it('returns new and content-changed vulns, skipping unchanged', () => {
    const a = makeVuln({ id: 'A' });
    const b = makeVuln({ id: 'B' });
    const existing = [a, b];
    const next = [makeVuln({ id: 'A' }), makeVuln({ id: 'B', title: 'changed' }), makeVuln({ id: 'C' })];
    const changed = selectChanged(existing, next).map((v) => v.id).sort();
    assert.deepEqual(changed, ['B', 'C']);
  });
});
