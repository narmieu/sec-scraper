# Pagination + Compact Index — Design Spec

**Date:** 2026-06-20
**Status:** Approved direction (compact index + lazy detail); detailed design pending review
**Phase:** 0 of the roadmap (the "also: introduce pagination" ask)
**Scope:** Dashboard data delivery + pagination. Scraper and the affectedness engine are untouched. Single implementation plan.

## Roadmap context

Phase 1 (affectedness engine) is done. This is **Phase 0** — the data-delivery / pagination fix for the dashboard. It deliberately carries the Phase-1 exposure fields (`exposure.status`, `fixedIn`) in its index, as planned.

## Problem

The dashboard is a static export (`output: 'export'`). Four list pages — `/` (all), `/frontend`, `/backend`, `/ai-llm` — each call `loadAllVulns()` at **build time** and pass the full records to `VulnListView`, which embeds them in the statically-exported HTML/RSC payload, hydrates them, filters/sorts/searches client-side, and renders **every** matching row with no pagination. `data/vulns.json` is **24 MB / ~10k records**, so:

1. Each visit downloads the full set baked into the page (megabytes of JSON-in-HTML), per list page.
2. The browser hydrates 10k objects and renders thousands of un-virtualized DOM rows.

`/archived` is a static placeholder (no data). The detail route `/vuln/[id]` is already a **separate static page** (`force-static`, `generateStaticParams` over all ids) that embeds only its one full record — so it is not part of the problem, and it is the natural target for lazy detail.

## Goals

- Cut the per-page payload by ~20× and bound DOM rendering, while **preserving** instant client-side filtering/sorting/search.
- Introduce **pagination** of the result list.
- Keep the zero-infra static-export model (no server/API/DB).
- Leave the scraper, the affectedness engine, and the detail route unchanged.

## Non-goals (YAGNI)

- No server-side pagination / API / database (that was the rejected heavier option).
- No detail shards — the existing static `/vuln/[id]` pages already serve full detail on navigation.
- No archive-browsing UI (`/archived` stays a placeholder).
- No virtualization library — pagination by slicing is sufficient at page size 50.
- No change to ranking, exposure, search semantics, or filters' behavior.
- No splitting the index into a separate lazy "search shard" (noted as a future optimization if the index grows).

## Architecture

**One compact index, generated at build, fetched once, paginated client-side; rows link to existing static detail pages.**

### 1. Compact index type + projection (`@sec/shared`)

A new `IndexEntry` type and a `toIndexEntry(vuln): IndexEntry` projection (typed, unit-testable, shared by the generator and the client):

```ts
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
  sources: string[];                 // source ids only (e.g. ['ghsa','osv'])
  stackMatch: StackMatch;            // { score, packages, reason } — reused as-is
  exposure?: { status: ExposureStatus; fixedIn?: string };
  publishedAt: string;
  modifiedAt: string;
  // search-only fields:
  summary: string;                   // truncated to ~160 chars
  affectedPackages: string[];        // unique package names from affected[]
}
```

Dropped vs. full `Vuln`: `details`, full `affected[]` (ranges/ecosystem/fixedIn — only package names kept, for search), `cvssVector`, `cwe`, `epss`, `mergedAt`, `aliases`, and the heavy `sources[]` objects (urls/externalIds/fetchedAt — only `source` ids kept). These all live on the detail page.

### 2. Build-time generation (dashboard)

A script `apps/dashboard/scripts/build-index.ts` reads `data/vulns.json` (same `process.cwd()`-relative path the existing `lib/data.ts` uses), maps each record through `toIndexEntry`, and writes `apps/dashboard/public/data/index.json` (a plain `IndexEntry[]`).

- Run via `tsx` (added to the dashboard's **devDependencies** — already in the monorepo lockfile via the scraper; build-tooling only, not a runtime dep).
- Wired as `prebuild` **and** `predev` in `apps/dashboard/package.json`, so both `pnpm build` (Vercel) and `pnpm dev` regenerate it. pnpm runs `prebuild` before `build` automatically; Vercel's `buildCommand` (`pnpm --filter @sec/dashboard build`) therefore regenerates it on every deploy (which the scraper triggers by committing `data/`).
- `apps/dashboard/public/data/` is **git-ignored** — the index is derived, regenerated each build, never committed.
- With `output: 'export'`, `public/data/index.json` is copied to `out/data/index.json`, fetchable at `/data/index.json` (Vercel serves it gzip/brotli-compressed).

### 3. Client fetch + pagination (`VulnListView`)

`VulnListView` changes from "receives full `vulns` prop" to "fetches the index once and paginates":

- New `lib/useVulnIndex.ts` — a client hook that `fetch('/data/index.json')` once, with a module-level promise cache so navigating between list pages does not refetch. Returns `{ entries, loading, error }`.
- `VulnListView({ sources, category? })`:
  - applies the optional `category` predicate (see §4) to `entries`,
  - runs the existing `severity / ecosystems / sources / stackMatchOnly / kevOnly / affectedOnly / hideRead / showDismissed / query` filters and `sortVulns` (now typed over `IndexEntry`),
  - **paginates**: `const PAGE_SIZE = 50; const page = useState(1)`; renders `filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)`; resets to page 1 via `useEffect` on `[filters, query, sort, category]`.
  - renders a loading skeleton while `loading`, and an error note if the fetch fails.
- New `components/Pagination.tsx` — `Prev` / `Page X of Y` (+ result count) / `Next`, hidden when ≤ 1 page. Disabled states at the ends.
- `sourceOptions` counts are computed from the fetched `entries` (their `sources` id arrays); source **health** dots still come from the small `sources` prop.

`VulnRow`, `lib/search.ts`, and `lib/sort.ts` switch their type from `Vuln` to `IndexEntry`:
- `VulnRow`: `vuln.sources` is now `string[]` → render `vuln.sources.join(', ')` directly (was `.map(s => s.source)`). All other fields (priority, severity, kev, cveId/ghsaId/id, publishedAt, title, stackMatch, exposure) exist on `IndexEntry`. Link target unchanged: `/vuln/${id}/`.
- `search.ts`: Fuse keys and substring scan use `affectedPackages` (was `affected.package`); `title`, `summary`, `cveId`, `ghsaId`, `stackMatch.packages` unchanged.
- `sort.ts`: type only; all sort keys (priority/publishedAt/modifiedAt/severity/cvss/stackMatch.score) exist on `IndexEntry`.

### 4. Pages become thin shells

The four list pages stop loading vulns. They remain server components that load only the tiny `sources` file and render the client view:

- `app/page.tsx`: `const sources = loadSourceHealth(); return <VulnListView sources={sources} />`
- `app/frontend/page.tsx`: `<VulnListView sources={sources} category="frontend" />`
- `app/backend/page.tsx`: `category="backend"`
- `app/ai-llm/page.tsx`: `category="ai-llm"`

Category predicates (centralized in `lib/categories.ts`, operating on `IndexEntry`), preserving today's exact logic:
- `frontend`: `ecosystems.includes('npm') || tags.includes('frontend') || tags.includes('nextjs')`
- `backend`: `ecosystems.includes('composer') || tags.includes('backend') || tags.includes('symfony')`
- `ai-llm`: `tags.includes('ai-llm') || ecosystems.includes('ai-llm')`

`lib/data.ts`'s `loadAllVulns` stays (the detail route + `generateStaticParams` still use it). `/archived`, `layout.tsx`, and the detail route are unchanged.

## Size

~10k entries × ~400–600 bytes compact ≈ 4–6 MB raw → **~1 MB gzip / less under brotli**, fetched once and HTTP-cached — versus ~24 MB embedded per list page today. DOM is bounded to ~50 rows/page. (`summary` truncated to ~160 chars is the main size lever; if the index later grows, split search-only fields into a lazily-fetched shard.)

## Testing

- **`toIndexEntry`** unit test in the scraper's `node:test` suite (the wired runner): fields mapped correctly, `summary` truncated, `affectedPackages` deduped from `affected[]`, `sources` reduced to ids, `exposure` carried through (incl. missing → omitted).
- **Generator** smoke: run `tsx scripts/build-index.ts`, assert `public/data/index.json` exists, parses as an array, length equals input, sample entry shape matches `IndexEntry`.
- **Dashboard** (no unit runner): `pnpm -r typecheck` is the gate; manual verification — build, confirm the index file and its size, load the app, paginate, filter/search/sort, open a detail page, switch categories.

## Acceptance criteria

1. No list page embeds full vuln records; `public/data/index.json` is generated at build and fetched client-side; the home page's initial document payload drops from tens of MB to the small client shell.
2. The list is paginated (page size 50): Prev/Next + "Page X of Y", page resets to 1 when filters/query/sort change, controls hidden when ≤ 1 page.
3. Filtering, sorting, and search produce the same results as before (now over the index), including the `affectedOnly` filter and exposure badges.
4. Category pages (`/frontend`, `/backend`, `/ai-llm`) show the same membership as today; rows link to working `/vuln/[id]` detail pages.
5. `pnpm -r typecheck` and `pnpm lint` pass; `data/vulns.json` and the scraper are untouched.

## Open decisions

1. **Page size = 50**, **summary truncation = 160 chars** — initial values, tunable.
2. **`tsx` as a dashboard devDependency** for the generator — justified build tooling (already in the monorepo); the alternative (a plain-JS generator that can't import the shared typed projection) was rejected for losing type-safety.
3. Single index file now; a lazily-fetched search-only shard is the noted next optimization if size grows.
