import { CADENCE_MS, scoreStackMatch, type LastRun, type SourcesFile, type Vuln } from '@sec/shared';
import type { Adapter } from './adapters/types.js';
import { ADAPTERS, ENRICHERS } from './adapters/index.js';
import { dedupeMerge } from './pipeline/dedupe.js';
import { normalizeVuln } from './pipeline/normalize.js';
import { computePriority } from './pipeline/score.js';
import {
  buildPaths,
  loadAlerted,
  loadSources,
  loadVulns,
  persistVulns,
  writeLastRun,
  writeSources,
} from './pipeline/persist.js';
import {
  defaultHealth,
  isAllowed,
  nextStateForAttempt,
  recordFailure,
  recordSuccess,
} from './pipeline/circuit-breaker.js';
import { loadStackIndex } from './stack.js';
import { dispatchAlerts } from './notify/dispatch.js';

export interface RunOpts {
  dryRun?: boolean;
  noNotify?: boolean;
  onlySource?: string;
  dataRoot: string;
  now?: Date;
}

export interface RunReport {
  newCount: number;
  updatedCount: number;
  droppedCount: number;
  alertCount: number;
  durationMs: number;
  errors: LastRun['errors'];
}

interface AdapterRunResult {
  adapter: Adapter;
  ok: boolean;
  fetched: number;
  durationMs: number;
  error?: string;
  items: Vuln[];
}

export async function runScrape(opts: RunOpts): Promise<RunReport> {
  const now = opts.now ?? new Date();
  const startedAt = now.toISOString();
  const startedMs = now.getTime();
  const paths = buildPaths(opts.dataRoot);
  const sources: SourcesFile = loadSources(paths);
  const existing = loadVulns(paths);
  const stackIndex = loadStackIndex(paths);
  const errors: LastRun['errors'] = [];

  const eligible = pickEligibleAdapters(sources, opts.onlySource, now);
  const results = await Promise.all(eligible.map((a) => runAdapter(a, sources)));

  for (const r of results) {
    const health = sources[r.adapter.id] ?? defaultHealth();
    if (r.ok) {
      sources[r.adapter.id] = recordSuccess(health, now);
    } else {
      sources[r.adapter.id] = recordFailure(health, r.error ?? 'unknown error', now);
      errors.push({ source: r.adapter.id, phase: 'fetch', message: r.error ?? 'unknown error' });
    }
  }

  let droppedCount = 0;
  const incoming: Vuln[] = [];
  for (const r of results) {
    for (const raw of r.items) {
      const parsed = normalizeVuln(raw);
      if (!parsed) {
        droppedCount++;
        continue;
      }
      incoming.push(parsed);
    }
  }

  const combinedBeforeDedupe = [...existing, ...incoming];
  let combined = dedupeMerge(combinedBeforeDedupe);

  for (const enricher of ENRICHERS) {
    try {
      const out = await enricher.enrich(combined);
      if (out.modifiedById.size > 0) {
        combined = combined.map((v) => {
          const patch = out.modifiedById.get(v.id);
          return patch ? { ...v, ...patch } : v;
        });
      }
      if (out.addedVulns && out.addedVulns.length > 0) {
        combined = dedupeMerge([...combined, ...out.addedVulns]);
      }
    } catch (e: unknown) {
      errors.push({
        source: enricher.id,
        phase: 'fetch',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  combined = combined.map((v) => {
    const sm = scoreStackMatch(v, stackIndex);
    const withMatch: Vuln = { ...v, stackMatch: sm };
    return { ...withMatch, priority: computePriority(withMatch) };
  });

  const newIds = new Set(existing.map((v) => v.id));
  const newCount = combined.filter((v) => !newIds.has(v.id)).length;
  const updatedCount = combined.length - newCount;

  let alertCount = 0;
  if (!opts.noNotify && !opts.dryRun) {
    const alerted = loadAlerted(paths);
    const dispatchResult = await dispatchAlerts(combined, alerted, paths, now);
    alertCount = dispatchResult.alertsFired;
  }

  if (!opts.dryRun) {
    persistVulns(paths, combined, now);
    writeSources(paths, sources);
  }

  const finishedAt = new Date();
  const lastRun: LastRun = {
    startedAt,
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedMs,
    stats: { newCount, updatedCount, droppedCount, alertCount },
    sources: Object.fromEntries(
      results.map((r) => [
        r.adapter.id,
        {
          ok: r.ok,
          fetched: r.fetched,
          durationMs: r.durationMs,
          ...(r.error ? { error: r.error } : {}),
        },
      ]),
    ),
    errors,
  };
  if (!opts.dryRun) writeLastRun(paths, lastRun);

  return {
    newCount,
    updatedCount,
    droppedCount,
    alertCount,
    durationMs: lastRun.durationMs,
    errors,
  };
}

function pickEligibleAdapters(
  sources: SourcesFile,
  onlySource: string | undefined,
  now: Date,
): Adapter[] {
  return ADAPTERS.filter((a) => {
    if (onlySource && a.id !== onlySource) return false;
    const health = sources[a.id];
    let h = health ?? defaultHealth();
    h = nextStateForAttempt(h, now.getTime());
    if (!isAllowed(h, now.getTime())) return false;
    if (h.lastFetchedAt) {
      const interval = CADENCE_MS[a.cadence];
      const dt = now.getTime() - new Date(h.lastFetchedAt).getTime();
      if (dt < interval - 60_000) return false;
    }
    return true;
  });
}

async function runAdapter(adapter: Adapter, sources: SourcesFile): Promise<AdapterRunResult> {
  const t0 = Date.now();
  const cursor = {
    lastFetchedAt: sources[adapter.id]?.lastFetchedAt,
    lastCursor: sources[adapter.id]?.lastCursor,
  };
  try {
    const { raw } = await adapter.fetch(cursor);
    const items: Vuln[] = [];
    for (const r of raw) {
      try {
        const v = adapter.normalize(r);
        if (v) items.push(v);
      } catch {
        // single-item failure ignored
      }
    }
    return {
      adapter,
      ok: true,
      fetched: raw.length,
      durationMs: Date.now() - t0,
      items,
    };
  } catch (e: unknown) {
    return {
      adapter,
      ok: false,
      fetched: 0,
      durationMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
      items: [],
    };
  }
}

