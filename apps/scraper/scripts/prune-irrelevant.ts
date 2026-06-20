#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPaths, loadStack } from '../src/pipeline/persist.js';
import { getClient, migrateSchema, loadLiveVulns, deleteVulns } from '@sec/db';
import { buildStackIndex, ROLLING_WINDOW_DAYS, Stack as StackSchema } from '@sec/shared';
import { filterByRelevance } from '../src/pipeline/relevance-filter.js';
import { buildAdapters } from '../src/adapters/index.js';
import { buildStackTargets } from '../src/pipeline/stack-targets.js';
import type { SourceKind } from '../src/adapters/types.js';

function resolveDefaultDataRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', 'data');
}

async function main(): Promise<void> {
  const dataRoot = process.argv[2] ? resolve(process.argv[2]) : resolveDefaultDataRoot();
  const paths = buildPaths(dataRoot);

  const rawStack = loadStack(paths);
  const parsed = StackSchema.safeParse(rawStack);
  if (!parsed.success) {
    console.warn('prune: stack.json parse failed — aborting to avoid over-pruning');
    console.warn(parsed.error.message);
    process.exit(1);
  }
  const stack = parsed.data;
  const stackIndex = buildStackIndex(stack);
  const targets = buildStackTargets(stack);
  const adapters = buildAdapters(targets);
  const kindBySourceId = new Map<string, SourceKind>(adapters.map((a) => [a.id, a.kind]));

  const db = getClient();
  await migrateSchema(db);
  const cutoffIso = new Date(Date.now() - ROLLING_WINDOW_DAYS * 86_400_000).toISOString();
  const vulns = await loadLiveVulns(db, cutoffIso);
  const before = vulns.length;
  const deltaBySource = new Map<string, number>();

  const droppedIds: string[] = [];
  for (const v of vulns) {
    const sourceId = v.sources[0]?.source ?? 'unknown';
    const kind = kindBySourceId.get(sourceId) ?? 'advisory';
    const verdict = filterByRelevance(v, kind, stackIndex);
    if (!verdict.keep) {
      deltaBySource.set(sourceId, (deltaBySource.get(sourceId) ?? 0) + 1);
      droppedIds.push(v.id);
    }
  }

  const dropped = droppedIds.length;
  console.warn(`prune: ${before} -> ${before - dropped} (dropped ${dropped})`);
  const sorted = [...deltaBySource.entries()].sort((a, b) => b[1] - a[1]);
  for (const [src, n] of sorted) console.warn(`  - ${src}: -${n}`);

  if (dropped === 0) {
    console.warn('prune: nothing to do');
    return;
  }

  await deleteVulns(db, droppedIds);
  console.warn(`prune: deleted ${dropped} records from the database`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
