/* eslint-disable no-console -- one-time migration script: console output is intended */
/**
 * One-time migration: load the legacy JSON data store into the database.
 *
 *   pnpm --filter @sec/db migrate            # -> local file db (data/local.db)
 *   TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... pnpm --filter @sec/db migrate   # -> Turso
 *
 * Reads data/vulns.json (live), data/archive/*.json.gz (aged-out), and the
 * sources/alerted/last-run state files, then upserts everything. Idempotent:
 * safe to re-run (rows are upserted by id; state tables are replaced).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vuln, type AlertedFile, type LastRun, type SourcesFile } from '@sec/shared';
import {
  getClient,
  migrateSchema,
  upsertVulns,
  saveSourceHealth,
  saveAlerted,
  saveLastRun,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url)); // packages/db/scripts
const dataArg = process.argv.find((a) => a.startsWith('--data='));
const dataDir = dataArg ? resolve(dataArg.slice('--data='.length)) : resolve(here, '..', '..', '..', 'data');

function readJson<T>(file: string, fallback: T): T {
  const path = join(dataDir, file);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function readArchives(): unknown[] {
  const dir = join(dataDir, 'archive');
  if (!existsSync(dir)) return [];
  const out: unknown[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json.gz')) continue;
    const buf = readFileSync(join(dir, f));
    if (buf.length === 0) continue;
    out.push(...(JSON.parse(gunzipSync(buf).toString('utf8')) as unknown[]));
  }
  return out;
}

async function main() {
  console.log(`[migrate] data dir: ${dataDir}`);
  const rawLive = readJson<unknown[]>('vulns.json', []);
  const rawArchived = readArchives();
  console.log(`[migrate] read ${rawLive.length} live + ${rawArchived.length} archived raw records`);

  // Validate and dedupe by id (a record can appear in both live and an archive).
  const byId = new Map<string, Vuln>();
  let invalid = 0;
  for (const raw of [...rawArchived, ...rawLive]) {
    const parsed = Vuln.safeParse(raw);
    if (parsed.success) byId.set(parsed.data.id, parsed.data);
    else invalid++;
  }
  const vulns = [...byId.values()];
  console.log(`[migrate] ${vulns.length} unique valid vulns (${invalid} invalid skipped)`);

  const sources = readJson<SourcesFile>('sources.json', {});
  const alerted = readJson<AlertedFile>('alerted.json', {});
  const lastRun = readJson<LastRun | null>('last-run.json', null);

  const db = getClient();
  await migrateSchema(db);
  await upsertVulns(db, vulns);
  await saveSourceHealth(db, sources);
  await saveAlerted(db, alerted);
  if (lastRun) await saveLastRun(db, lastRun);

  const count = (await db.execute('SELECT count(*) AS c FROM vulns')).rows[0]!.c;
  console.log(`[migrate] done. vulns table now holds ${count} rows`);
  console.log(
    `[migrate] state: ${Object.keys(sources).length} sources, ${Object.keys(alerted).length} alerted, lastRun=${lastRun ? 'yes' : 'no'}`,
  );

  if (Number(count) !== vulns.length) {
    throw new Error(`row count ${count} != expected ${vulns.length}`);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
