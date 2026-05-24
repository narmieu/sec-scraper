#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPaths, loadVulns, persistVulns, loadStack } from '../src/pipeline/persist.js';
import { buildStackIndex, Stack as StackSchema } from '@sec/shared';
import { filterByRelevance } from '../src/pipeline/relevance-filter.js';
import { buildAdapters } from '../src/adapters/index.js';
import { buildStackTargets } from '../src/pipeline/stack-targets.js';
import type { SourceKind } from '../src/adapters/types.js';

function resolveDefaultDataRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', 'data');
}

function main(): void {
  const dataRoot = process.argv[2] ? resolve(process.argv[2]) : resolveDefaultDataRoot();
  const paths = buildPaths(dataRoot);

  const rawStack = loadStack(paths);
  const parsed = StackSchema.safeParse(rawStack);
  const stack = parsed.success ? parsed.data : { frontend: {}, backend: {}, tools: {} };
  const stackIndex = buildStackIndex(stack);
  const targets = buildStackTargets(stack);
  const adapters = buildAdapters(targets);
  const kindBySourceId = new Map<string, SourceKind>(adapters.map((a) => [a.id, a.kind]));

  const vulns = loadVulns(paths);
  const before = vulns.length;
  const deltaBySource = new Map<string, number>();

  const survivors = vulns.filter((v) => {
    const sourceId = v.sources[0]?.source ?? 'unknown';
    const kind = kindBySourceId.get(sourceId) ?? 'advisory';
    const verdict = filterByRelevance(v, kind, stackIndex);
    if (!verdict.keep) {
      deltaBySource.set(sourceId, (deltaBySource.get(sourceId) ?? 0) + 1);
      return false;
    }
    return true;
  });

  const after = survivors.length;
  const dropped = before - after;

  console.warn(`prune: ${before} -> ${after} (dropped ${dropped})`);
  const sorted = [...deltaBySource.entries()].sort((a, b) => b[1] - a[1]);
  for (const [src, n] of sorted) console.warn(`  - ${src}: -${n}`);

  if (dropped === 0) {
    console.warn('prune: nothing to do');
    return;
  }

  persistVulns(paths, survivors, new Date());
  console.warn(`prune: wrote ${after} records to ${paths.vulns}`);
}

main();
