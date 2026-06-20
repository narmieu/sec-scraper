# JSON → Turso (libSQL) Migration — Design

**Date:** 2026-06-21
**Status:** Approved, pending implementation plan
**Author:** matej.kujundzic (with Claude)

## Summary

Move the scraper's persisted data out of git-committed JSON and into a real
database (Turso / libSQL — hosted SQLite). The scraper writes incrementally over
the network; the dashboard stays a static Vercel export whose build step queries
the DB to emit the index. This kills the four pains driving the migration:

1. **Git bloat** — `.git` is 160MB because the bot commits the full 24MB
   `vulns.json` hourly (476 of 539 commits are `[bot] scrape` dumps).
2. **Full-file rewrites** — every run loads and rewrites all ~10,136 vulns.
3. **No real queries** — all filtering happens client-side over static shards.
4. **No schema** — data is one untyped JSON blob.

### Static vs. real-queries tension (resolved)

"Static dashboard" and "real queries/API" pull against each other. Resolution:
land real SQL at the **DB and build layer now** (scraper upserts, build queries,
ad-hoc SQL all work immediately), keep the dashboard **static**, and isolate all
data access behind a `@sec/db` query API so flipping to **live API routes later**
is a small, contained change rather than a re-architecture. A live in-browser API
is explicitly **out of scope** for this migration.

## Goals

- Scraper persists to Turso via incremental upserts (no full-file rewrite).
- Scraped data and per-run state leave git entirely; `.git` stops growing.
- A typed relational schema with indexes on the queryable/sortable fields.
- Dashboard remains a free, static Vercel export with no behavior change for users.
- A clean `@sec/db` seam that can later back live API routes unchanged.

## Non-Goals (YAGNI)

- Live in-browser API routes / dropping `output: 'export'`.
- Full-text (FTS5) search.
- Periodic DB backups/dumps to artifacts.
- Rewriting existing git history to reclaim the 160MB (separate, risky
  `git filter-repo` job — history *stops growing* here, but is not *shrunk*).
- Full relational normalization of nested arrays (affected/sources/etc.) — they
  stay as JSON columns.

## Current Architecture (for reference)

- **Monorepo** (pnpm): `apps/scraper`, `apps/dashboard`, `packages/shared`.
- **Scraper** (`apps/scraper`, hourly GitHub Action): `main.ts` loads
  `data/vulns.json`, runs ~25 adapters, dedupes/enriches/scores in memory,
  `persist.ts` writes the whole file back + moves vulns older than
  `ROLLING_WINDOW_DAYS` (90d) into monthly `data/archive/<YYYY-MM>.json.gz`.
  The workflow then `git add data/ && commit && push` with a push-race retry loop.
- **State files**: `sources.json` (circuit-breaker health), `alerted.json`
  (notification dedupe), `last-run.json` (run report). All committed hourly.
- **Config**: `stack.json` — hand-edited tech-stack config (not scraped data).
- **Dashboard** (`apps/dashboard`, Next.js `output: 'export'` on Vercel): a
  `prebuild` script `build-index.ts` reads `vulns.json` and emits
  `public/data/index.json` (lightweight `IndexEntry[]`) + one
  `public/data/vuln/<id>.json` per vuln (~10k shards). Client hooks
  (`useVulnIndex`, `useVulnDetail`) `fetch()` those static files. `lib/data.ts`
  `readFileSync`s `sources.json` / `last-run.json` / `alerted.json` at build time
  for the source-health UI.
- **Shared** (`packages/shared`): Zod schemas (`Vuln`, `SourceHealth`,
  `AlertEntry`, `LastRun`, `Stack`), `toIndexEntry`, scoring/exposure logic.

## Target Architecture

```
GitHub Action (hourly)
  └─ scraper ──@sec/db upsert──▶ Turso (hosted SQLite / libSQL)
                                       │
 Vercel build ──@sec/db query──────────┘
   └─ emit public/data/index.json + vuln/<id>.json + status.json  (static)
   └─ dashboard fetches static JSON (free · CDN · no server)

 Local dev / tests ──▶ file:data/local.db  (no network, no token)
```

### New package: `@sec/db`

Single owner of all storage. Lives at `packages/db`. Both `apps/scraper` and
`apps/dashboard` depend on it. `@sec/shared` remains schemas/types only.

Responsibilities and public surface (the seam that keeps the dashboard
static-now / dynamic-later):

- `getClient()` — memoized `@libsql/client`. Reads `TURSO_DATABASE_URL` +
  `TURSO_AUTH_TOKEN`; **falls back to `file:data/local.db`** when the URL is
  unset so local dev and tests need no network or token.
- `migrateSchema()` — idempotent `CREATE TABLE IF NOT EXISTS …` + indexes.
- Vulns: `loadLiveVulns(cutoffIso): Vuln[]`, `upsertVulns(Vuln[]): void`
  (single transaction, `INSERT … ON CONFLICT(id) DO UPDATE`),
  `getVuln(id): Vuln | null`, `getLiveIndex(cutoffIso): IndexEntry[]`,
  `getArchivedIndex(cutoffIso): IndexEntry[]`.
- State: `loadSourceHealth()/saveSourceHealth()`, `loadAlerted()/saveAlerted()`,
  `loadLastRun()/saveLastRun()`.
- Row (de)serialization: scalar columns ⇄ typed fields; JSON columns ⇄ nested
  fields, re-validated through the `@sec/shared` Zod schemas at the boundary.

### Schema

Pragmatic hybrid — typed columns for everything queried/sorted, JSON columns for
nested structures. Mirrors the Zod `Vuln`.

```sql
CREATE TABLE IF NOT EXISTS vulns (
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
  priority         INTEGER NOT NULL,
  exploit_maturity TEXT,            -- denormalized from exploit.maturity for querying
  exposure_status  TEXT,            -- denormalized from exposure.status for querying
  published_at     TEXT    NOT NULL, -- ISO-8601
  modified_at      TEXT    NOT NULL,
  merged_at        TEXT    NOT NULL,
  aliases          TEXT    NOT NULL, -- JSON string[]
  ecosystems       TEXT    NOT NULL, -- JSON string[]
  cwe              TEXT    NOT NULL, -- JSON string[]
  tags             TEXT    NOT NULL, -- JSON string[]
  affected         TEXT    NOT NULL, -- JSON Affected[]
  stack_match      TEXT    NOT NULL, -- JSON StackMatch
  exposure         TEXT,            -- JSON Exposure | null
  exploit          TEXT,            -- JSON Exploit | null
  sources          TEXT    NOT NULL  -- JSON SourceRef[]
);
CREATE INDEX IF NOT EXISTS idx_vulns_priority  ON vulns(priority DESC);
CREATE INDEX IF NOT EXISTS idx_vulns_modified  ON vulns(modified_at);
CREATE INDEX IF NOT EXISTS idx_vulns_published ON vulns(published_at);
CREATE INDEX IF NOT EXISTS idx_vulns_severity  ON vulns(severity);
CREATE INDEX IF NOT EXISTS idx_vulns_kev       ON vulns(kev);
CREATE INDEX IF NOT EXISTS idx_vulns_cve       ON vulns(cve_id);

CREATE TABLE IF NOT EXISTS source_health (
  id   TEXT PRIMARY KEY,  -- adapter id
  data TEXT NOT NULL      -- JSON SourceHealth
);

CREATE TABLE IF NOT EXISTS alerted (
  id   TEXT PRIMARY KEY,  -- vuln id
  data TEXT NOT NULL      -- JSON AlertEntry
);

CREATE TABLE IF NOT EXISTS last_run (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL      -- JSON LastRun (single row)
);
```

`stack.json` stays in git — hand-edited config, not scraped data, not in the DB.

### Archive subsystem: deleted

`data/archive/*.gz`, `readArchive`, `mergeArchive`, and the
`persistVulns` month-bucketing all go away. "Live" vs "archived" becomes a query:

- live = `WHERE modified_at >= :cutoff`
- archived = `WHERE modified_at < :cutoff`

Aged-out rows simply remain in `vulns`. The scraper's working set stays bounded
exactly as today by loading only the live window (`loadLiveVulns(cutoff)`), so
dedupe/merge memory and semantics are unchanged.

### Scraper changes

- `pipeline/persist.ts` becomes a thin adapter over `@sec/db`:
  - `loadVulns` → `loadLiveVulns(cutoff)`.
  - `persistVulns` → `upsertVulns(combined.filter(live))` in one transaction.
    Only rows present in the combined live set are written; nothing is deleted.
  - `writeSources`/`writeAlerted`/`writeLastRun` → `saveSourceHealth` /
    `saveAlerted` / `saveLastRun`.
  - `loadSources`/`loadAlerted` → DB; `loadStack` keeps reading `stack.json`.
- `main.ts` orchestration, scoring, exposure, and the new/updated/archived
  **count logic are unchanged** (they operate on in-memory arrays).
- Schema is ensured via `migrateSchema()` at scraper startup.

### Dashboard changes (stays `output: 'export'`)

- `scripts/build-index.ts` queries `@sec/db` instead of reading `vulns.json`:
  - `getLiveIndex(cutoff)` → `public/data/index.json` (same `IndexEntry[]` shape).
  - `getVuln`/iterate → `public/data/vuln/<id>.json` shards (unchanged shape).
  - **new** `public/data/status.json` = `{ sources, lastRun }` from the DB.
- `lib/data.ts`: `loadSourceHealth`/`loadLastRun`/`loadAlertedFile` read the
  build-emitted `status.json` instead of `readFileSync` on the removed JSON files.
  (DB access stays centralized in `build-index.ts`; `lib/data.ts` never touches
  the DB.)
- **No component changes**; client hooks still fetch the same static URLs.

### GitHub Action / Vercel

- Workflow: drop the `git add data/ … commit … push` step **and** its push-race
  retry loop. Add repo secrets `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (write).
  A guard step fails the run fast if the DB secret is missing (no silent no-op
  against an empty local file).
- Vercel: add `TURSO_DATABASE_URL` + a **read-only** `TURSO_AUTH_TOKEN` env var
  for the build.
- Dashboard freshness: the static export reads the DB only at build time, and
  data no longer flows through git, so the workflow fires a Vercel **deploy hook**
  (`VERCEL_DEPLOY_HOOK_URL` secret) after each scrape to trigger a rebuild.

## Data Flow

1. Hourly Action runs scraper → `migrateSchema()` → `loadLiveVulns(cutoff)` →
   adapters → dedupe/enrich/score → `upsertVulns(...)` + state saves to Turso.
2. (Optional) Action triggers a Vercel deploy, or Vercel rebuilds on its own
   cadence / manual trigger.
3. Vercel build → `build-index.ts` queries Turso → emits static
   `index.json` + `vuln/<id>.json` + `status.json` → Next static export → CDN.
4. Browser fetches static JSON exactly as today.

## Error Handling

- DB unreachable in scraper → fail the run loudly (non-zero exit, run-log
  artifact) as today; no silent data loss since writes are transactional.
- DB unreachable at build → `build-index.ts` logs and writes an **empty** index
  (mirrors today's `try/catch` that warns and writes an empty index) so a deploy
  never hard-fails on a transient DB blip.
- Row deserialization failures re-validate through Zod; a malformed row is
  logged and skipped rather than crashing the whole load.
- Upserts run in a single transaction → a mid-run failure rolls back cleanly.

## Migration & Cutover

1. Implement `@sec/db` + a one-time `scripts/migrate-json-to-db.ts` that loads
   `vulns.json` + all `archive/*.gz` + `sources.json` + `alerted.json` +
   `last-run.json`, calls `migrateSchema()`, and bulk-inserts.
2. Provision the Turso DB; run the migration script once against it (verify row
   counts: ~10,136 live + archived).
3. Switch scraper + dashboard build to `@sec/db`; wire secrets/env.
4. Run the scraper once (manual `workflow_dispatch`) end-to-end against Turso;
   confirm a Vercel build produces an identical-looking dashboard.
5. `git rm` the migrated data files (`vulns.json`, `archive/`, `sources.json`,
   `alerted.json`, `last-run.json`); add them to `.gitignore`. Keep `stack.json`.

The exact operator commands live in the companion
[`2026-06-21-turso-cutover-runbook.md`](./2026-06-21-turso-cutover-runbook.md).

## Testing (TDD)

- `@sec/db` unit tests against in-memory libSQL (`file::memory:`):
  - `Vuln` round-trip (scalar + JSON columns) preserves Zod-valid output.
  - `upsertVulns` is idempotent and updates-in-place on conflict.
  - `loadLiveVulns(cutoff)` returns only rows `>= cutoff`, sorted by priority.
  - state save/load round-trips for source_health / alerted / last_run.
  - `getLiveIndex` matches `toIndexEntry` output.
- Existing `apps/scraper` pipeline tests and `@sec/shared` tests stay green.
- Migration script verified by loading the real fixtures into `file::memory:`
  and asserting the resulting row count equals the source count.

## Risks & Mitigations

- **Token leakage** — write token only in GH secrets; build token is read-only.
- **Turso availability** — free tier SLA is best-effort; build degrades to empty
  index rather than failing, and the scraper retries next hour.
- **Local DX** — `file:data/local.db` fallback keeps dev/tests offline; add
  `data/local.db*` to `.gitignore`.
- **History not shrunk** — `.git` stays 160MB until an optional, separate
  history rewrite; acceptable since the bleeding stops.
