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
