/* eslint-disable no-console -- build-time script: console output is intended */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toIndexEntry, type IndexEntry, type Vuln } from '@sec/shared';

const cwd = process.cwd(); // apps/dashboard
const vulnsPath = join(cwd, '..', '..', 'data', 'vulns.json');
const outDir = join(cwd, 'public', 'data');
const outPath = join(outDir, 'index.json');

let vulns: Vuln[] = [];
try {
  vulns = JSON.parse(readFileSync(vulnsPath, 'utf8')) as Vuln[];
} catch (e) {
  console.warn(`[build-index] could not read ${vulnsPath}: ${(e as Error).message}; writing empty index`);
}

const entries: IndexEntry[] = vulns.map(toIndexEntry);
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(entries), 'utf8');
console.log(`[build-index] wrote ${entries.length} entries to ${outPath}`);

const vulnDir = join(outDir, 'vuln');
mkdirSync(vulnDir, { recursive: true });
for (const v of vulns) {
  writeFileSync(join(vulnDir, `${encodeURIComponent(v.id)}.json`), JSON.stringify(v), 'utf8');
}
console.log(`[build-index] wrote ${vulns.length} detail shards to ${vulnDir}`);
