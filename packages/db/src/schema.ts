import type { Client } from '@libsql/client';

/**
 * DDL for the vulnerability store. Pragmatic hybrid: scalar columns for the
 * fields the dashboard queries/sorts on, JSON (TEXT) columns for nested arrays
 * and objects. All statements are `IF NOT EXISTS` so migration is idempotent.
 */
const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS vulns (
     id               TEXT PRIMARY KEY,
     cve_id           TEXT,
     ghsa_id          TEXT,
     title            TEXT    NOT NULL,
     summary          TEXT    NOT NULL,
     details          TEXT,
     severity         TEXT    NOT NULL,
     cvss             REAL,
     cvss_vector      TEXT,
     epss             REAL,
     kev              INTEGER NOT NULL DEFAULT 0,
     withdrawn        INTEGER NOT NULL DEFAULT 0,
     priority         INTEGER NOT NULL,
     exploit_maturity TEXT,
     exposure_status  TEXT,
     published_at     TEXT    NOT NULL,
     modified_at      TEXT    NOT NULL,
     merged_at        TEXT    NOT NULL,
     aliases          TEXT    NOT NULL,
     ecosystems       TEXT    NOT NULL,
     cwe              TEXT    NOT NULL,
     tags             TEXT    NOT NULL,
     affected         TEXT    NOT NULL,
     stack_match      TEXT    NOT NULL,
     exposure         TEXT,
     exploit          TEXT,
     sources          TEXT    NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_vulns_priority  ON vulns(priority DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_vulns_modified  ON vulns(modified_at)`,
  `CREATE INDEX IF NOT EXISTS idx_vulns_published ON vulns(published_at)`,
  `CREATE INDEX IF NOT EXISTS idx_vulns_severity  ON vulns(severity)`,
  `CREATE INDEX IF NOT EXISTS idx_vulns_kev       ON vulns(kev)`,
  `CREATE INDEX IF NOT EXISTS idx_vulns_cve       ON vulns(cve_id)`,
  `CREATE TABLE IF NOT EXISTS source_health (
     id   TEXT PRIMARY KEY,
     data TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS alerted (
     id   TEXT PRIMARY KEY,
     data TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS last_run (
     id   INTEGER PRIMARY KEY CHECK (id = 1),
     data TEXT NOT NULL
   )`,
];

export async function migrateSchema(client: Client): Promise<void> {
  for (const sql of STATEMENTS) {
    await client.execute(sql);
  }
  // Additive migrations for DBs created before a column existed. CREATE TABLE
  // IF NOT EXISTS above only helps fresh DBs; existing ones need ALTER. libSQL
  // has no ADD COLUMN IF NOT EXISTS, so guard on the live column set.
  await ensureColumn(client, 'vulns', 'withdrawn', 'INTEGER NOT NULL DEFAULT 0');
}

async function ensureColumn(
  client: Client,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  if (info.rows.some((r) => r.name === column)) return;
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
