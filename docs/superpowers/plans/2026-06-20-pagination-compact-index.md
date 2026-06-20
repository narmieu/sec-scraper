# Pagination + Compact Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop embedding 24 MB of full vuln records into static list pages — generate a compact `IndexEntry[]` at build, fetch it once client-side, and paginate the list (page size 50), while preserving filtering/sorting/search and linking rows to the existing static detail pages.

**Architecture:** A shared `toIndexEntry` projection drops heavy fields. A dashboard build script writes `public/data/index.json`. `VulnListView` fetches it via a cached hook, runs the existing filters/sort/search over `IndexEntry`, and slices into pages. The four list pages become thin shells passing a `category` predicate; the detail route, scraper, and engine are untouched.

**Tech Stack:** TypeScript (ESM), `@sec/shared` (extensionless relative imports), Next.js 16 static export (`output: 'export'`), Zustand, Fuse.js, `node:test` via `tsx` (scraper suite), `tsx` build script.

## Global Constraints

- **DO NOT COMMIT and DO NOT `git add`.** Leave all changes unstaged on `main` for the user to review.
- Import conventions: `@sec/shared` package import everywhere; **shared** package uses extensionless relative imports; **scraper** uses `.js` relative specifiers; **dashboard** uses `@/...` aliases and extensionless relative imports. Match each file's existing style.
- No new **runtime** dependencies. `tsx` is added to the dashboard's **devDependencies** for the build script only (already in the monorepo lockfile via the scraper).
- The generated `apps/dashboard/public/data/index.json` is **git-ignored**, never committed.
- Page size = **50**; summary truncation = **160** chars (exact values, used verbatim).
- The dashboard has **no unit-test runner** — for dashboard tasks the gate is `pnpm --filter @sec/dashboard typecheck` (and `pnpm --filter @sec/dashboard build` for the final integration). Only the shared `toIndexEntry` gets a `node:test` unit test (in the scraper suite).
- Verify commands: `pnpm -r typecheck`, `pnpm --filter @sec/scraper test`, `pnpm lint`, `pnpm --filter @sec/dashboard build`.

---

## File Structure

**`@sec/shared` (`packages/shared/src/`)**
- `index-entry.ts` *(new)* — `IndexEntry` + `toIndexEntry(vuln)`.
- `index.ts` — export it.

**`@sec/scraper`**
- `pipeline/__tests__/index-entry.test.ts` *(new)* — `toIndexEntry` unit tests.

**`@sec/dashboard`**
- `scripts/build-index.ts` *(new)* — generator.
- `package.json` — add `tsx` devDep + `prebuild`/`predev`.
- `lib/useVulnIndex.ts` *(new)* — cached client fetch hook.
- `lib/categories.ts` *(new)* — category predicates over `IndexEntry`.
- `components/Pagination.tsx` *(new)*.
- `components/VulnRow.tsx` — accept `IndexEntry`.
- `lib/search.ts`, `lib/sort.ts` — operate on `IndexEntry`.
- `components/VulnListView.tsx` — fetch + filter + paginate + skeleton.
- `app/page.tsx`, `app/frontend/page.tsx`, `app/backend/page.tsx`, `app/ai-llm/page.tsx` — thin shells.

**Repo**
- `.gitignore` — ignore `apps/dashboard/public/data/`.

---

## Task 1: IndexEntry type + projection (shared)

**Files:**
- Create: `packages/shared/src/index-entry.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/scraper/src/pipeline/__tests__/index-entry.test.ts`

**Interfaces:**
- Produces: `IndexEntry` (see code) and `toIndexEntry(v: Vuln): IndexEntry`.

- [ ] **Step 1: Write the failing test**

Create `apps/scraper/src/pipeline/__tests__/index-entry.test.ts`:

```ts
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { toIndexEntry, type Vuln } from '@sec/shared';

function makeVuln(p: Partial<Vuln> = {}): Vuln {
  return {
    id: 'CVE-1', aliases: [], title: 'Title', summary: 'S', details: 'D',
    severity: 'high', cvss: 7.5, ecosystems: ['npm'], cwe: ['CWE-79'],
    affected: [
      { ecosystem: 'npm', package: 'next', versions: '<1', fixedIn: '1.0.0' },
      { ecosystem: 'npm', package: 'next', versions: '>=2 <3' },
    ],
    stackMatch: { score: 100, packages: ['next'], reason: 'direct-dep' },
    exposure: { status: 'affected', package: 'next', installed: '0.9', vulnerableRange: '<1', fixedIn: '1.0.0' },
    priority: 80, kev: true,
    publishedAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-02T00:00:00.000Z',
    mergedAt: '2026-01-02T00:00:00.000Z',
    sources: [
      { source: 'ghsa', externalId: 'g1', url: 'https://e.com/g1', fetchedAt: '2026-01-01T00:00:00.000Z' },
      { source: 'osv', externalId: 'o1', url: 'https://e.com/o1', fetchedAt: '2026-01-01T00:00:00.000Z' },
    ],
    cveId: 'CVE-1', ghsaId: 'GHSA-1', tags: ['frontend'],
    ...p,
  } as Vuln;
}

describe('toIndexEntry', () => {
  it('keeps list/filter/sort fields and reduces sources to ids', () => {
    const e = toIndexEntry(makeVuln());
    assert.equal(e.id, 'CVE-1');
    assert.equal(e.title, 'Title');
    assert.equal(e.severity, 'high');
    assert.equal(e.cvss, 7.5);
    assert.equal(e.kev, true);
    assert.equal(e.priority, 80);
    assert.deepEqual(e.sources, ['ghsa', 'osv']);
    assert.deepEqual(e.stackMatch, { score: 100, packages: ['next'], reason: 'direct-dep' });
    assert.equal(e.cveId, 'CVE-1');
    assert.equal(e.ghsaId, 'GHSA-1');
  });

  it('dedupes affectedPackages from affected[]', () => {
    const e = toIndexEntry(makeVuln());
    assert.deepEqual(e.affectedPackages, ['next']);
  });

  it('truncates summary to 160 chars', () => {
    const long = 'x'.repeat(500);
    const e = toIndexEntry(makeVuln({ summary: long }));
    assert.equal(e.summary.length, 160);
  });

  it('carries exposure as {status, fixedIn} and omits unknown', () => {
    const e = toIndexEntry(makeVuln());
    assert.deepEqual(e.exposure, { status: 'affected', fixedIn: '1.0.0' });
    const e2 = toIndexEntry(makeVuln({ exposure: { status: 'unknown' } }));
    assert.equal(e2.exposure, undefined);
  });

  it('omits optional fields when absent', () => {
    const e = toIndexEntry(makeVuln({ cveId: undefined, ghsaId: undefined, cvss: undefined, exposure: undefined }));
    assert.equal(e.cveId, undefined);
    assert.equal(e.ghsaId, undefined);
    assert.equal(e.cvss, undefined);
    assert.equal(e.exposure, undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sec/scraper exec tsx --test src/pipeline/__tests__/index-entry.test.ts`
Expected: FAIL — `toIndexEntry` not exported.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/index-entry.ts`:

```ts
import type { Ecosystem, ExposureStatus, Severity, StackMatch, Tag, Vuln } from './schemas';

export interface IndexEntry {
  id: string;
  cveId?: string;
  ghsaId?: string;
  title: string;
  severity: Severity;
  cvss?: number;
  kev: boolean;
  priority: number;
  ecosystems: Ecosystem[];
  tags: Tag[];
  sources: string[];
  stackMatch: StackMatch;
  exposure?: { status: ExposureStatus; fixedIn?: string };
  publishedAt: string;
  modifiedAt: string;
  summary: string;
  affectedPackages: string[];
}

const SUMMARY_MAX = 160;

export function toIndexEntry(v: Vuln): IndexEntry {
  const entry: IndexEntry = {
    id: v.id,
    title: v.title,
    severity: v.severity,
    kev: v.kev,
    priority: v.priority,
    ecosystems: v.ecosystems,
    tags: v.tags,
    sources: [...new Set(v.sources.map((s) => s.source))],
    stackMatch: v.stackMatch,
    publishedAt: v.publishedAt,
    modifiedAt: v.modifiedAt,
    summary: v.summary.length > SUMMARY_MAX ? v.summary.slice(0, SUMMARY_MAX) : v.summary,
    affectedPackages: [...new Set(v.affected.map((a) => a.package))],
  };
  if (v.cveId) entry.cveId = v.cveId;
  if (v.ghsaId) entry.ghsaId = v.ghsaId;
  if (v.cvss !== undefined) entry.cvss = v.cvss;
  if (v.exposure && v.exposure.status !== 'unknown') {
    entry.exposure = v.exposure.fixedIn
      ? { status: v.exposure.status, fixedIn: v.exposure.fixedIn }
      : { status: v.exposure.status };
  }
  return entry;
}
```

- [ ] **Step 4: Export from index**

In `packages/shared/src/index.ts`, add:

```ts
export * from './index-entry';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @sec/scraper exec tsx --test src/pipeline/__tests__/index-entry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Typecheck and leave unstaged**

Run: `pnpm -r typecheck` — no errors. Leave changes unstaged.

---

## Task 2: Build-index generator + wiring

**Files:**
- Create: `apps/dashboard/scripts/build-index.ts`
- Modify: `apps/dashboard/package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `toIndexEntry` (Task 1).
- Produces: `apps/dashboard/public/data/index.json` (an `IndexEntry[]`) at build/dev time.

- [ ] **Step 1: Write the generator**

Create `apps/dashboard/scripts/build-index.ts`:

```ts
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
```

- [ ] **Step 2: Add tsx devDep + prebuild/predev scripts**

In `apps/dashboard/package.json`, set the `scripts` block to:

```json
  "scripts": {
    "dev": "next dev -p 3000",
    "predev": "tsx scripts/build-index.ts",
    "build": "next build",
    "prebuild": "tsx scripts/build-index.ts",
    "start": "next start",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
```

and add to `devDependencies` (keep the list alph):

```json
    "tsx": "^4.22.3",
```

- [ ] **Step 3: Git-ignore the generated index**

In `.gitignore`, add a line:

```
apps/dashboard/public/data/
```

- [ ] **Step 4: Install + run the generator**

Run: `pnpm install` (links the new `tsx` devDep), then `pnpm --filter @sec/dashboard exec tsx scripts/build-index.ts`
Expected: prints `[build-index] wrote <N> entries to .../public/data/index.json` where N equals the record count in `data/vulns.json`.

- [ ] **Step 5: Verify the output**

Run: `node -e "const a=require('./apps/dashboard/public/data/index.json'); console.log('entries', a.length, 'sample keys', Object.keys(a[0]||{}).join(','))"`
Expected: `entries <N>` and sample keys include `id,title,severity,kev,priority,ecosystems,tags,sources,stackMatch,publishedAt,modifiedAt,summary,affectedPackages`.

- [ ] **Step 6: Typecheck and leave unstaged**

Run: `pnpm -r typecheck` — no errors (the script typechecks under the dashboard project). Leave changes unstaged. Confirm `git status` does NOT show `apps/dashboard/public/data/index.json` (it's ignored).

---

## Task 3: useVulnIndex hook

**Files:**
- Create: `apps/dashboard/lib/useVulnIndex.ts`

**Interfaces:**
- Produces: `useVulnIndex(): { entries: IndexEntry[]; loading: boolean; error: string | null }` — fetches `/data/index.json` once (module-cached).

- [ ] **Step 1: Write the hook**

Create `apps/dashboard/lib/useVulnIndex.ts`:

```ts
'use client';
import { useEffect, useState } from 'react';
import type { IndexEntry } from '@sec/shared';

let cache: Promise<IndexEntry[]> | null = null;

function loadIndex(): Promise<IndexEntry[]> {
  if (!cache) {
    cache = fetch('/data/index.json')
      .then((r) => {
        if (!r.ok) throw new Error(`index fetch failed: ${r.status}`);
        return r.json() as Promise<IndexEntry[]>;
      })
      .catch((e) => {
        cache = null; // allow retry on next mount
        throw e;
      });
  }
  return cache;
}

export function useVulnIndex(): { entries: IndexEntry[]; loading: boolean; error: string | null } {
  const [entries, setEntries] = useState<IndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadIndex()
      .then((e) => {
        if (active) {
          setEntries(e);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return { entries, loading, error };
}
```

- [ ] **Step 2: Typecheck and leave unstaged**

Run: `pnpm --filter @sec/dashboard typecheck` — no errors. Leave unstaged.

---

## Task 4: Pagination component + category predicates

**Files:**
- Create: `apps/dashboard/components/Pagination.tsx`
- Create: `apps/dashboard/lib/categories.ts`

**Interfaces:**
- Produces: `Pagination({ page, pageCount, total, onPage })`; `type Category = 'frontend' | 'backend' | 'ai-llm'`; `CATEGORY_PREDICATES: Record<Category, (v: IndexEntry) => boolean>`.

- [ ] **Step 1: Write the Pagination component**

Create `apps/dashboard/components/Pagination.tsx`:

```tsx
'use client';

export function Pagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  const btn =
    'rounded border border-zinc-700 px-3 py-2 min-h-[36px] text-[var(--color-fg)] hover:bg-[var(--color-surface)] disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3 text-xs text-[var(--color-muted)]">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </button>
      <span className="tabular-nums">
        Page {page} of {pageCount} · {total} results
      </span>
      <button type="button" className={btn} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write the category predicates**

Create `apps/dashboard/lib/categories.ts`:

```ts
import type { IndexEntry } from '@sec/shared';

export type Category = 'frontend' | 'backend' | 'ai-llm';

export const CATEGORY_PREDICATES: Record<Category, (v: IndexEntry) => boolean> = {
  frontend: (v) => v.ecosystems.includes('npm') || v.tags.includes('frontend') || v.tags.includes('nextjs'),
  backend: (v) => v.ecosystems.includes('composer') || v.tags.includes('backend') || v.tags.includes('symfony'),
  'ai-llm': (v) => v.tags.includes('ai-llm') || v.ecosystems.includes('ai-llm'),
};
```

- [ ] **Step 3: Typecheck and leave unstaged**

Run: `pnpm --filter @sec/dashboard typecheck` — no errors. Leave unstaged.

---

## Task 5: Switch the list to the index (atomic)

This task is atomic: `VulnRow`, `search`, `sort`, `VulnListView`, and the four pages flip from `Vuln` to `IndexEntry` together — `typecheck` is only green when all are consistent.

**Files:**
- Modify: `apps/dashboard/components/VulnRow.tsx`
- Modify: `apps/dashboard/lib/search.ts`
- Modify: `apps/dashboard/lib/sort.ts`
- Modify: `apps/dashboard/components/VulnListView.tsx`
- Modify: `apps/dashboard/app/page.tsx`, `app/frontend/page.tsx`, `app/backend/page.tsx`, `app/ai-llm/page.tsx`

**Interfaces:**
- Consumes: `IndexEntry`, `useVulnIndex`, `CATEGORY_PREDICATES`/`Category`, `Pagination`.
- Produces: `VulnListView({ sources, category? })` that fetches the index and paginates; rows typed `IndexEntry`.

- [ ] **Step 1: VulnRow accepts IndexEntry**

In `apps/dashboard/components/VulnRow.tsx`:
- Change the import `import type { Vuln } from '@sec/shared';` to `import type { IndexEntry } from '@sec/shared';`.
- Change the signature `export function VulnRow({ vuln }: { vuln: Vuln })` to `export function VulnRow({ vuln }: { vuln: IndexEntry })`.
- Change the sources line from `{vuln.sources.map((s) => s.source).join(', ')}` to `{vuln.sources.join(', ')}`.

No other changes (all other fields exist on `IndexEntry`).

- [ ] **Step 2: search.ts operates on IndexEntry**

Replace `apps/dashboard/lib/search.ts` with:

```ts
'use client';
import Fuse from 'fuse.js';
import type { IndexEntry } from '@sec/shared';

let fuseInstance: Fuse<IndexEntry> | null = null;
let indexedFor: IndexEntry[] | null = null;

function getFuse(vulns: IndexEntry[]): Fuse<IndexEntry> {
  if (fuseInstance && indexedFor === vulns) return fuseInstance;
  fuseInstance = new Fuse(vulns, {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'summary', weight: 1 },
      { name: 'cveId', weight: 1.5 },
      { name: 'ghsaId', weight: 1.5 },
      { name: 'affectedPackages', weight: 1.5 },
      { name: 'stackMatch.packages', weight: 1.5 },
    ],
    threshold: 0.2,
    minMatchCharLength: 3,
    ignoreLocation: true,
    useExtendedSearch: false,
  });
  indexedFor = vulns;
  return fuseInstance;
}

function substringMatches(vulns: IndexEntry[], q: string): IndexEntry[] {
  const needle = q.toLowerCase();
  const out: IndexEntry[] = [];
  for (const v of vulns) {
    if (v.title.toLowerCase().includes(needle)) {
      out.push(v);
      continue;
    }
    if (v.cveId?.toLowerCase().includes(needle) || v.ghsaId?.toLowerCase().includes(needle)) {
      out.push(v);
      continue;
    }
    if (v.affectedPackages.some((p) => p.toLowerCase().includes(needle))) {
      out.push(v);
      continue;
    }
    if (v.stackMatch.packages.some((p) => p.toLowerCase().includes(needle))) {
      out.push(v);
      continue;
    }
    if (v.summary.toLowerCase().includes(needle)) {
      out.push(v);
    }
  }
  return out;
}

export function search(vulns: IndexEntry[], query: string): IndexEntry[] {
  const q = query.trim();
  if (!q) return vulns;
  const exact = substringMatches(vulns, q);
  if (exact.length > 0) return exact;
  return getFuse(vulns).search(q).map((r) => r.item);
}
```

- [ ] **Step 3: sort.ts operates on IndexEntry**

In `apps/dashboard/lib/sort.ts`, change `import type { Severity, Vuln } from '@sec/shared';` to `import type { IndexEntry, Severity } from '@sec/shared';`, and replace every `Vuln` in the file with `IndexEntry` (the `COMPARATORS` record type and `sortVulns(vulns: IndexEntry[], ...)`). The comparator bodies are unchanged — all keys (`priority`, `publishedAt`, `modifiedAt`, `severity`, `cvss`, `stackMatch.score`) exist on `IndexEntry`.

- [ ] **Step 4: Rewrite VulnListView**

Replace `apps/dashboard/components/VulnListView.tsx` with:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import type { IndexEntry, SourcesFile } from '@sec/shared';
import { useStore } from '@/lib/store';
import { useVulnIndex } from '@/lib/useVulnIndex';
import { search } from '@/lib/search';
import { sortVulns } from '@/lib/sort';
import { CATEGORY_PREDICATES, type Category } from '@/lib/categories';
import { FilterSidebar, type SourceOption } from '@/components/FilterSidebar';
import { ActiveFilters } from '@/components/ActiveFilters';
import { SearchBar } from '@/components/SearchBar';
import { SortSelect } from '@/components/SortSelect';
import { VulnRow } from '@/components/VulnRow';
import { Pagination } from '@/components/Pagination';

const PAGE_SIZE = 50;

export function VulnListView({ sources, category }: { sources: SourcesFile; category?: Category }) {
  const { entries, loading, error } = useVulnIndex();
  const filters = useStore((s) => s.filters);
  const query = useStore((s) => s.query);
  const sort = useStore((s) => s.sort);
  const readIds = useStore((s) => s.readIds);
  const hiddenIds = useStore((s) => s.hiddenIds);
  const reset = useStore((s) => s.reset);
  const [page, setPage] = useState(1);

  const scoped = useMemo(() => {
    const pred = category ? CATEGORY_PREDICATES[category] : null;
    return pred ? entries.filter(pred) : entries;
  }, [entries, category]);

  const sourceOptions = useMemo<SourceOption[]>(() => {
    const counts = new Map<string, number>();
    for (const v of scoped) for (const s of v.sources) counts.set(s, (counts.get(s) ?? 0) + 1);
    const ids = new Set<string>([...counts.keys(), ...Object.keys(sources)]);
    return [...ids]
      .map((id) => ({
        id,
        count: counts.get(id) ?? 0,
        state: (sources[id]?.state ?? 'closed') as SourceOption['state'],
      }))
      .sort((a, b) => {
        const aIssue = a.state !== 'closed' ? 1 : 0;
        const bIssue = b.state !== 'closed' ? 1 : 0;
        if (aIssue !== bIssue) return bIssue - aIssue;
        if (b.count !== a.count) return b.count - a.count;
        return a.id.localeCompare(b.id);
      });
  }, [scoped, sources]);

  const filtered = useMemo(() => {
    let out: IndexEntry[] = scoped;
    if (filters.severities.length > 0) out = out.filter((v) => filters.severities.includes(v.severity));
    if (filters.ecosystems.length > 0)
      out = out.filter((v) => v.ecosystems.some((e) => filters.ecosystems.includes(e)));
    if (filters.sources.length > 0) out = out.filter((v) => v.sources.some((s) => filters.sources.includes(s)));
    if (filters.stackMatchOnly) out = out.filter((v) => v.stackMatch.score > 0);
    if (filters.kevOnly) out = out.filter((v) => v.kev);
    if (filters.affectedOnly) out = out.filter((v) => v.exposure?.status === 'affected');
    if (filters.hideRead) out = out.filter((v) => !readIds.includes(v.id));
    if (!filters.showDismissed) out = out.filter((v) => !hiddenIds.includes(v.id));
    if (query) out = search(out, query);
    return sortVulns(out, sort);
  }, [scoped, filters, query, sort, readIds, hiddenIds]);

  useEffect(() => {
    setPage(1);
  }, [filters, query, sort, category]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="flex">
      <FilterSidebar sourceOptions={sourceOptions} />
      <section className="flex-1 min-w-0">
        <div className="border-b border-zinc-800 px-4 py-3 space-y-3">
          <SearchBar />
          <ActiveFilters />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--color-muted)] tabular-nums">
              {filtered.length} of {scoped.length} shown
            </span>
            <SortSelect />
          </div>
        </div>
        <div>
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <div className="px-4 py-16 text-center text-sm text-[var(--color-muted)]">
              Failed to load data ({error}).
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center text-sm text-[var(--color-muted)]">
              <p>No vulnerabilities match the current filters.</p>
              <button
                type="button"
                onClick={reset}
                className="rounded border border-zinc-700 px-3 py-2 text-xs text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <>
              {pageItems.map((v) => (
                <VulnRow key={v.id} vuln={v} />
              ))}
              <Pagination page={safePage} pageCount={pageCount} total={filtered.length} onPage={setPage} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-zinc-800">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="h-8 w-8 shrink-0 rounded bg-[var(--color-surface)] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 rounded bg-[var(--color-surface)] animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-[var(--color-surface)] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Thin page shells**

Replace each list page so it loads only the small `sources` file and passes a `category`:

`apps/dashboard/app/page.tsx`:
```tsx
import { loadSourceHealth } from '@/lib/data';
import { VulnListView } from '@/components/VulnListView';

export default function HomePage() {
  return <VulnListView sources={loadSourceHealth()} />;
}
```

`apps/dashboard/app/frontend/page.tsx`:
```tsx
import { loadSourceHealth } from '@/lib/data';
import { VulnListView } from '@/components/VulnListView';

export default function FrontendPage() {
  return <VulnListView sources={loadSourceHealth()} category="frontend" />;
}
```

`apps/dashboard/app/backend/page.tsx`:
```tsx
import { loadSourceHealth } from '@/lib/data';
import { VulnListView } from '@/components/VulnListView';

export default function BackendPage() {
  return <VulnListView sources={loadSourceHealth()} category="backend" />;
}
```

`apps/dashboard/app/ai-llm/page.tsx`:
```tsx
import { loadSourceHealth } from '@/lib/data';
import { VulnListView } from '@/components/VulnListView';

export default function AiLlmPage() {
  return <VulnListView sources={loadSourceHealth()} category="ai-llm" />;
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm -r typecheck`
Expected: no errors (the atomic switch is now consistent; `loadAllVulns` is no longer imported by the list pages, but remains used by the detail route — no unused-import errors).

- [ ] **Step 7: Integration build**

Run: `pnpm --filter @sec/dashboard build`
Expected: `prebuild` regenerates `public/data/index.json`, then `next build` exports successfully to `out/`. Confirm the build completes with no errors and that `out/data/index.json` exists.

- [ ] **Step 8: Lint and leave unstaged**

Run: `pnpm lint` — no new errors. Leave all changes unstaged (do not commit).

---

## Self-Review

**Spec coverage:**
- Compact index type + projection → Task 1 (with unit tests for truncation, dedupe, source-id reduction, exposure carry/omit).
- Build-time generation + wiring + gitignore → Task 2 (prebuild/predev, tsx devDep, ignored output).
- Client fetch hook (cached) → Task 3.
- Pagination + category predicates → Task 4.
- `VulnListView` fetch/filter/paginate/skeleton, `VulnRow`/`search`/`sort` → `IndexEntry`, thin pages → Task 5 (atomic; typecheck + build gate).
- Detail route, scraper, engine untouched → no task modifies them; `loadAllVulns` retained for the detail route.
- Acceptance criteria 1-5 → covered by Tasks 1-5 and the Task 5 integration build.

**Placeholder scan:** none — every code step is complete; every run step has an exact command and expected result.

**Type consistency:** `IndexEntry` defined in Task 1 is consumed identically in Tasks 2-5. `toIndexEntry` signature stable. `Category`/`CATEGORY_PREDICATES` (Task 4) used in `VulnListView` (Task 5). `Pagination` props (Task 4) match the call site (Task 5). `search`/`sort` switch to `IndexEntry[]` in lockstep with `VulnRow` and `VulnListView` (same task) so typecheck is green only at Task 5 completion — intentional and called out.

**Open decisions (from spec, non-blocking):** page size 50 / summary 160 (tunable); `tsx` as dashboard devDep (justified build tooling); single index file now, lazy search-shard later if it grows.
