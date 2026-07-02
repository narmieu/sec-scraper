import {
  CADENCE_MS,
  ROLLING_WINDOW_DAYS,
  evaluateExposure,
  type LastRun,
  type SourcesFile,
  type Vuln,
} from '@sec/shared';
import type { Adapter } from './adapters/types.js';
import { buildAdapters, ENRICHERS } from './adapters/index.js';
import { dedupeMerge } from '@/pipeline/dedupe.js';
import { normalizeVuln } from '@/pipeline/normalize.js';
import { computePriority } from '@/pipeline/score.js';
import { buildPaths } from '@/pipeline/persist.js';
import {
  getClient,
  migrateSchema,
  loadLiveVulns,
  upsertVulns,
  selectChanged,
  loadSourceHealth,
  saveSourceHealth,
  loadAlerted,
  saveLastRun,
  loadEnricherState,
  saveEnricherState,
} from '@sec/db';
import {
  defaultHealth,
  isAllowed,
  nextStateForAttempt,
  recordFailure,
  recordSuccess,
} from '@/pipeline/circuit-breaker.js';
import { loadStackBundle } from '@/stack.js';
import { dispatchAlerts } from '@/notify/dispatch.js';
import { filterByRelevance } from '@/pipeline/relevance-filter.js';
import { isDue } from '@/pipeline/cadence.js';

// Opt-in per-source timing to stderr (SCRAPE_TRACE=1). Streams as each source
// starts/finishes so a run killed by the CI cap still shows the culprit.
const TRACE = Boolean(process.env['SCRAPE_TRACE']);
function trace(msg: string): void {
  if (TRACE) console.warn(`[trace +${process.uptime().toFixed(1)}s] ${msg}`);
}

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
  archivedCount: number;
  droppedCount: number;
  filteredCount: number;
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
  const db = getClient();
  await migrateSchema(db);
  const cutoffMs = now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const sources: SourcesFile = await loadSourceHealth(db);
  const enricherState = await loadEnricherState(db);
  const existing = await loadLiveVulns(db, cutoffIso);
  const { index: stackIndex, targets: stackTargets } = loadStackBundle(paths);
  const adapters = buildAdapters(stackTargets);
  const errors: LastRun['errors'] = [];

  trace(`loaded existing=${existing.length}; dispatching adapters`);
  const eligible = pickEligibleAdapters(adapters, sources, opts.onlySource, now);
  trace(`eligible adapters=${eligible.length}/${adapters.length}`);
  const results = await Promise.all(eligible.map((a) => runAdapter(a, sources)));
  trace(`all adapters settled`);

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
  let filteredCount = 0;
  const kindBySourceId = new Map(adapters.map((a) => [a.id, a.kind]));
  const incoming: Vuln[] = [];
  for (const r of results) {
    const kind = kindBySourceId.get(r.adapter.id) ?? 'advisory';
    for (const raw of r.items) {
      const parsed = normalizeVuln(raw);
      if (!parsed) {
        droppedCount++;
        continue;
      }
      const verdict = filterByRelevance(parsed, kind, stackIndex);
      if (!verdict.keep) {
        filteredCount++;
        if (opts.onlySource) {
          console.warn(`[filter] drop ${r.adapter.id}: ${verdict.reason} :: ${parsed.title}`);
        }
        continue;
      }
      incoming.push(parsed);
    }
  }

  trace(`normalize+filter done incoming=${incoming.length} dropped=${droppedCount} filtered=${filteredCount}`);
  const combinedBeforeDedupe = [...existing, ...incoming];
  let combined = dedupeMerge(combinedBeforeDedupe);
  trace(`dedupe done n=${combined.length} (from ${combinedBeforeDedupe.length})`);

  for (const enricher of ENRICHERS) {
    // Respect each enricher's declared cadence (e.g. exploit-intel is daily) so
    // the hourly run doesn't re-download large feeds every time. State lives in
    // its own table, separate from adapter source-health.
    if (!isDue(enricherState[enricher.id]?.lastFetchedAt, CADENCE_MS[enricher.cadence], now.getTime())) {
      trace(`enricher ${enricher.id} skip (not due)`);
      continue;
    }
    const et0 = Date.now();
    trace(`enricher ${enricher.id} start`);
    try {
      const out = await enricher.enrich(combined);
      trace(`enricher ${enricher.id} ok ms=${Date.now() - et0}`);
      if (out.modifiedById.size > 0) {
        combined = combined.map((v) => {
          const patch = out.modifiedById.get(v.id);
          return patch ? { ...v, ...patch } : v;
        });
      }
      if (out.addedVulns && out.addedVulns.length > 0) {
        combined = dedupeMerge([...combined, ...out.addedVulns]);
      }
      // Record only on success; a thrown enricher stays due and retries next run.
      enricherState[enricher.id] = { lastFetchedAt: now.toISOString() };
    } catch (e: unknown) {
      errors.push({
        source: enricher.id,
        phase: 'fetch',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  trace(`enrichers done; scoring n=${combined.length}`);
  // Untouched existing records pass through dedupe and enrichers as the same
  // object reference and keep their persisted exposure/stackMatch/priority.
  // Only new or modified records need the (per-item costly) exposure evaluation.
  const existingRefs = new Set<Vuln>(existing);
  let rescored = 0;
  combined = combined.map((v) => {
    if (existingRefs.has(v)) return v;
    rescored++;
    const { exposure, stackMatch } = evaluateExposure(v, stackIndex);
    const withMatch: Vuln = { ...v, exposure, stackMatch };
    return { ...withMatch, priority: computePriority(withMatch) };
  });
  trace(`scored ${rescored}/${combined.length} (skipped unchanged existing)`);

  // Counts reflect the live (post-persist) set — items aged out by the
  // 90d rolling window aren't "new" from the dashboard's perspective.
  const live = combined.filter((v) => new Date(v.modifiedAt).getTime() >= cutoffMs);
  const archivedCount = combined.length - live.length;
  const existingLiveIds = new Set(existing.map((v) => v.id));
  const newCount = live.filter((v) => !existingLiveIds.has(v.id)).length;
  const updatedCount = live.length - newCount;

  let alertCount = 0;
  if (!opts.noNotify && !opts.dryRun) {
    const alerted = await loadAlerted(db);
    const dispatchResult = await dispatchAlerts(combined, alerted, db, now);
    alertCount = dispatchResult.alertsFired;
  }

  if (!opts.dryRun) {
    await upsertVulns(db, selectChanged(existing, combined));
    pruneStaleSources(sources, adapters);
    await saveSourceHealth(db, sources);
    await saveEnricherState(db, enricherState);
  }

  const finishedAt = new Date();
  const lastRun: LastRun = {
    startedAt,
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedMs,
    stats: { newCount, updatedCount, archivedCount, droppedCount, filteredCount, alertCount },
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
  if (!opts.dryRun) await saveLastRun(db, lastRun);

  return {
    newCount,
    updatedCount,
    archivedCount,
    droppedCount,
    filteredCount,
    alertCount,
    durationMs: lastRun.durationMs,
    errors,
  };
}

function pickEligibleAdapters(
  adapters: Adapter[],
  sources: SourcesFile,
  onlySource: string | undefined,
  now: Date,
): Adapter[] {
  return adapters.filter((a) => {
    if (onlySource && a.id !== onlySource) return false;
    const health = sources[a.id];
    let h = health ?? defaultHealth();
    h = nextStateForAttempt(h, now.getTime());
    if (!isAllowed(h, now.getTime())) return false;
    if (!isDue(h.lastFetchedAt, CADENCE_MS[a.cadence], now.getTime())) return false;
    return true;
  });
}

function pruneStaleSources(sources: SourcesFile, adapters: Adapter[]): void {
  const known = new Set(adapters.map((a) => a.id));
  for (const id of Object.keys(sources)) {
    if (!known.has(id)) delete sources[id];
  }
}

async function runAdapter(adapter: Adapter, sources: SourcesFile): Promise<AdapterRunResult> {
  const t0 = Date.now();
  const cursor = {
    lastFetchedAt: sources[adapter.id]?.lastFetchedAt,
    lastCursor: sources[adapter.id]?.lastCursor,
  };
  trace(`adapter ${adapter.id} start`);
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
    trace(`adapter ${adapter.id} ok fetched=${raw.length} kept=${items.length} ms=${Date.now() - t0}`);
    return {
      adapter,
      ok: true,
      fetched: raw.length,
      durationMs: Date.now() - t0,
      items,
    };
  } catch (e: unknown) {
    trace(`adapter ${adapter.id} ERR ms=${Date.now() - t0} ${e instanceof Error ? e.message : String(e)}`);
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
