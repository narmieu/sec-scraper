import type { Client, InStatement } from '@libsql/client';
import { AlertEntry, LastRun, SourceHealth } from '@sec/shared';
import type { AlertedFile, SourcesFile } from '@sec/shared';

/** Load an `id -> data(JSON)` table into a record, validating each value. */
async function loadRecord<T>(
  client: Client,
  table: string,
  parse: (raw: unknown) => T,
): Promise<Record<string, T>> {
  const res = await client.execute(`SELECT id, data FROM ${table}`);
  const out: Record<string, T> = {};
  for (const row of res.rows) out[String(row.id)] = parse(JSON.parse(String(row.data)));
  return out;
}

/** Replace an entire `id -> data(JSON)` table with `record` in one transaction —
 *  matches the old "write the whole file" semantics, so removed ids are deleted. */
async function replaceRecord(client: Client, table: string, record: Record<string, unknown>): Promise<void> {
  const stmts: InStatement[] = [{ sql: `DELETE FROM ${table}`, args: [] }];
  for (const [id, value] of Object.entries(record)) {
    stmts.push({ sql: `INSERT INTO ${table} (id, data) VALUES (?, ?)`, args: [id, JSON.stringify(value)] });
  }
  await client.batch(stmts, 'write');
}

export function loadSourceHealth(client: Client): Promise<SourcesFile> {
  return loadRecord(client, 'source_health', (r) => SourceHealth.parse(r));
}
export function saveSourceHealth(client: Client, sources: SourcesFile): Promise<void> {
  return replaceRecord(client, 'source_health', sources);
}

export function loadAlerted(client: Client): Promise<AlertedFile> {
  return loadRecord(client, 'alerted', (r) => AlertEntry.parse(r));
}
export function saveAlerted(client: Client, alerted: AlertedFile): Promise<void> {
  return replaceRecord(client, 'alerted', alerted);
}

export async function loadLastRun(client: Client): Promise<LastRun | null> {
  const res = await client.execute('SELECT data FROM last_run WHERE id = 1');
  const row = res.rows[0];
  return row ? LastRun.parse(JSON.parse(String(row.data))) : null;
}
export async function saveLastRun(client: Client, lastRun: LastRun): Promise<void> {
  await client.execute({
    sql: 'INSERT INTO last_run (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
    args: [JSON.stringify(lastRun)],
  });
}
