import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createClient } from './client.js';
import { migrateSchema } from './schema.js';

describe('migrateSchema', () => {
  it('creates all tables and is idempotent', async () => {
    const db = createClient(':memory:');
    await migrateSchema(db);
    await migrateSchema(db); // second run must not throw
    const res = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    assert.deepEqual(
      res.rows.map((r) => r.name),
      ['alerted', 'last_run', 'source_health', 'vulns'],
    );
  });

  it('adds the withdrawn column to a pre-existing vulns table', async () => {
    const db = createClient(':memory:');
    // Simulate a DB created before the withdrawn column existed. CREATE TABLE
    // IF NOT EXISTS no-ops on it, so migrateSchema must ALTER in the new column
    // (and stay idempotent on re-run).
    await db.execute(
      `CREATE TABLE vulns (id TEXT PRIMARY KEY, cve_id TEXT, ghsa_id TEXT,
         title TEXT NOT NULL, summary TEXT NOT NULL, details TEXT, severity TEXT NOT NULL,
         cvss REAL, cvss_vector TEXT, epss REAL, kev INTEGER NOT NULL DEFAULT 0,
         priority INTEGER NOT NULL, exploit_maturity TEXT, exposure_status TEXT,
         published_at TEXT NOT NULL, modified_at TEXT NOT NULL, merged_at TEXT NOT NULL,
         aliases TEXT NOT NULL, ecosystems TEXT NOT NULL, cwe TEXT NOT NULL, tags TEXT NOT NULL,
         affected TEXT NOT NULL, stack_match TEXT NOT NULL, exposure TEXT, exploit TEXT,
         sources TEXT NOT NULL)`,
    );
    await migrateSchema(db);
    await migrateSchema(db); // must not throw on the second run
    const cols = await db.execute('PRAGMA table_info(vulns)');
    const names = cols.rows.map((r) => r.name as string);
    assert.ok(names.includes('withdrawn'), 'withdrawn column should be added');
  });

  it('creates the documented indexes on vulns', async () => {
    const db = createClient(':memory:');
    await migrateSchema(db);
    const res = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='vulns'",
    );
    const names = res.rows.map((r) => r.name as string);
    for (const expected of [
      'idx_vulns_cve',
      'idx_vulns_kev',
      'idx_vulns_modified',
      'idx_vulns_priority',
      'idx_vulns_published',
      'idx_vulns_severity',
    ]) {
      assert.ok(names.includes(expected), `missing index ${expected}`);
    }
  });
});
