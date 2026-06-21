/* eslint-disable no-console -- build-time script: console output is intended */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROLLING_WINDOW_DAYS,
  toIndexEntry,
  type AlertedFile,
  type IndexEntry,
  type LastRun,
  type SourcesFile,
  type Vuln,
} from '@sec/shared';
import {
  getClient,
  loadLiveVulns,
  loadSourceHealth,
  loadLastRun,
  loadAlerted,
} from '@sec/db';

const cwd = process.cwd(); // apps/dashboard
const outDir = join(cwd, 'public', 'data');
const vulnDir = join(outDir, 'vuln');

async function main() {
  let vulns: Vuln[] = [];
  let sources: SourcesFile = {};
  let lastRun: LastRun | null = null;
  let alerted: AlertedFile = {};

  // A DB blip must never hard-fail a deploy — fall back to empty, valid outputs.
  try {
    // Read-only path: the dashboard build uses a read-only token, so it must not
    // write. Schema creation is owned by the scraper and the migration script.
    const db = getClient();
    const cutoffIso = new Date(Date.now() - ROLLING_WINDOW_DAYS * 86_400_000).toISOString();
    vulns = await loadLiveVulns(db, cutoffIso);
    [sources, lastRun, alerted] = await Promise.all([
      loadSourceHealth(db),
      loadLastRun(db),
      loadAlerted(db),
    ]);
  } catch (e) {
    console.warn(`[build-index] DB unavailable: ${(e as Error).message}; writing empty outputs`);
  }

  mkdirSync(vulnDir, { recursive: true });

  const entries: IndexEntry[] = vulns.map(toIndexEntry);
  writeFileSync(join(outDir, 'index.json'), JSON.stringify(entries), 'utf8');
  console.log(`[build-index] wrote ${entries.length} entries to index.json`);

  for (const v of vulns) {
    writeFileSync(join(vulnDir, `${encodeURIComponent(v.id)}.json`), JSON.stringify(v), 'utf8');
  }
  console.log(`[build-index] wrote ${vulns.length} detail shards to ${vulnDir}`);

  writeFileSync(join(outDir, 'status.json'), JSON.stringify({ sources, lastRun, alerted }), 'utf8');
  console.log(`[build-index] wrote status.json (${Object.keys(sources).length} sources, lastRun=${lastRun ? 'yes' : 'no'})`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
