import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AlertedFile, LastRun, SourcesFile } from '@sec/shared';
import { createClient } from './client.js';
import { migrateSchema } from './schema.js';
import {
  loadSourceHealth,
  saveSourceHealth,
  loadAlerted,
  saveAlerted,
  loadLastRun,
  saveLastRun,
} from './state.js';

async function freshDb() {
  const db = createClient(':memory:');
  await migrateSchema(db);
  return db;
}
const norm = (x: unknown) => JSON.parse(JSON.stringify(x));

const SOURCES: SourcesFile = {
  ghsa: { consecutiveFailures: 0, state: 'closed', lastSuccess: '2026-06-10T00:00:00.000Z', lastFetchedAt: '2026-06-10T00:00:00.000Z' },
  nvd: { consecutiveFailures: 3, state: 'open', lastError: 'timeout', reopenAt: '2026-06-10T01:00:00.000Z' },
};

const ALERTED: AlertedFile = {
  'CVE-2026-1': {
    alertedAt: '2026-06-10T00:00:00.000Z',
    channels: { teams: 'msg-123' },
    vulnSnapshot: { priority: 80, kev: true, severity: 'high' },
  },
};

const LAST_RUN: LastRun = {
  startedAt: '2026-06-10T00:00:00.000Z',
  finishedAt: '2026-06-10T00:01:00.000Z',
  durationMs: 60000,
  stats: { newCount: 2, updatedCount: 5, archivedCount: 1, droppedCount: 0, filteredCount: 3, alertCount: 1 },
  sources: { ghsa: { ok: true, fetched: 10, durationMs: 1200 } },
  errors: [],
};

describe('source_health state', () => {
  it('round-trips a SourcesFile', async () => {
    const db = await freshDb();
    await saveSourceHealth(db, SOURCES);
    assert.deepEqual(norm(await loadSourceHealth(db)), norm(SOURCES));
  });

  it('returns {} when empty', async () => {
    const db = await freshDb();
    assert.deepEqual(await loadSourceHealth(db), {});
  });

  it('fully replaces — ids dropped from the object are deleted', async () => {
    const db = await freshDb();
    await saveSourceHealth(db, SOURCES);
    await saveSourceHealth(db, { ghsa: SOURCES.ghsa! });
    assert.deepEqual(Object.keys(await loadSourceHealth(db)), ['ghsa']);
  });
});

describe('alerted state', () => {
  it('round-trips an AlertedFile', async () => {
    const db = await freshDb();
    await saveAlerted(db, ALERTED);
    assert.deepEqual(norm(await loadAlerted(db)), norm(ALERTED));
  });

  it('returns {} when empty', async () => {
    const db = await freshDb();
    assert.deepEqual(await loadAlerted(db), {});
  });
});

describe('last_run state', () => {
  it('round-trips a LastRun', async () => {
    const db = await freshDb();
    await saveLastRun(db, LAST_RUN);
    assert.deepEqual(norm(await loadLastRun(db)), norm(LAST_RUN));
  });

  it('returns null when never written', async () => {
    const db = await freshDb();
    assert.equal(await loadLastRun(db), null);
  });

  it('keeps a single row across saves', async () => {
    const db = await freshDb();
    await saveLastRun(db, LAST_RUN);
    await saveLastRun(db, { ...LAST_RUN, durationMs: 99 });
    const got = await loadLastRun(db);
    assert.equal(got!.durationMs, 99);
  });
});
