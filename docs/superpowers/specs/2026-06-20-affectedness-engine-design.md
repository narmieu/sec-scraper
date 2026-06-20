# Affectedness Engine — Design Spec

**Date:** 2026-06-20
**Status:** Approved (design); pending spec review
**Phase:** 1 of the "fundamentally improve the base feature" roadmap
**Scope:** Scraper engine + shared schema + scoring + minimal dashboard surfacing. Single implementation plan.

## Roadmap context

This is Phase 1 of a four-part effort to level up the core "scrape → judge relevance → rank → surface" feature:

- **Phase 0 — Pagination / data delivery** (next spec): scraper emits a compact filter/sort/search index + per-page/detail shards into `public/`; dashboard paginates and lazy-loads. Cuts the ~24 MB single-page payload. **Will carry this phase's new fields (`exposure.status`, `fixedIn`, `installed`) in its index** — which is why the engine is specced first.
- **Phase 1 — Affectedness engine** (this spec).
- **Phase 2 — Intel:** exploit-in-the-wild beyond KEV/EPSS, patch-status surfacing, optional one-line AI triage.
- **Phase 3 — Delivery:** "what changed since I last looked," digests per channel.

The chosen stack source for Phase 1 is the **hand-kept `data/stack.json`** (already versioned). Upgrading the *input* to lockfile/SBOM derivation is a deliberate fast-follow that does not change the engine.

## Problem

Matching already exists — `packages/shared/src/stack-matcher.ts` reads structured `affected` ranges (OSV and GHSA both preserve `versions` + `fixedIn`) and runs `semver.satisfies` against the installed version, scoring 100 / 60 / 40 / 0. But it is shallow and partly incorrect:

1. **"Safe" ranks like a near-hit and is never demoted.** Installed `next@14.2.35` against a `next < 13` advisory → package matches, version fails → **score 60, reason `direct-dep`**. `pipeline/score.ts` only demotes `stackMatch.score === 0`, so vulns the user is provably **not** affected by sit high in the feed. Primary noise source.
2. **First-match-wins, order-dependent.** `scoreStackMatch` `return`s on the first `affected[]` entry naming a stack package; a later exact hit (100) is lost behind an earlier safe match (60).
3. **Range parser is npm-centric and inverts AND-ranges.** `versionSatisfies` does `range.replace(/,\s*/g, ' || ')` — comma → OR. Composer/other advisory formats use comma for **AND** (`>=1.0, <2.0`), so the logic inverts → false positives. Backend `stack.json` versions are Composer **constraints** (`^6.4`), not pins; `semver.coerce('^6.4') → 6.4.0` is lossy, so backend verdicts are guesses presented as precision.
4. **No verdict, no evidence.** Nothing emits "affected / safe / unknown" or "fixed in X, you're on Y", so the dashboard cannot answer *are we exposed* or *is there a patch*.

## Goals

- Produce a **correct, explicit per-vuln exposure verdict** against the installed stack, evaluating **all** affected entries (order-independent) with **ecosystem-correct** range semantics.
- Make the verdict drive ranking: **affected** boosted/floored, **safe** demoted, **potential** moderate, **unknown** unchanged.
- Surface the verdict in the dashboard (badge + "Affected only" filter).
- Be additive and back-compatible; no data migration needed (engine recomputes every run).

## Non-goals (YAGNI)

- Transitive dependencies / lockfile / SBOM ingestion (fast-follow on stack source).
- New sources or exploit-in-the-wild intel (Phase 2).
- AI triage / summaries (Phase 2).
- Digests / "what changed" (Phase 3).
- Pagination and the compact index (Phase 0, separate spec).
- New sort keys (priority already reflects exposure).

## Data model

Additive schema changes in `packages/shared/src/schemas.ts` (+ `constants.ts`):

```ts
// constants.ts
export const EXPOSURE_STATUSES = ['affected', 'safe', 'potential', 'unknown'] as const;

// schemas.ts
export const ExposureStatus = z.enum(EXPOSURE_STATUSES);

export const Exposure = z.object({
  status: ExposureStatus,
  package: z.string().optional(),        // matched stack dep, original case
  ecosystem: Ecosystem.optional(),       // ecosystem of the matched affected entry
  installed: z.string().optional(),      // installed version/constraint from stack.json
  vulnerableRange: z.string().optional(),// the affected range that decided the verdict
  fixedIn: z.string().optional(),        // first patched version, when known
});

// Vuln: add
exposure: Exposure.default({ status: 'unknown' }),
```

`stackMatch` is **retained** (its numeric `score` is derived from the verdict) so existing sorts/filters (`stackMatchOnly`, `stackmatch-desc`) keep working unchanged.

**Back-compat:** `exposure` is `.default({ status: 'unknown' })`, so the ~10k existing `vulns.json` records parse without migration. The engine recomputes `exposure` for the whole combined set every run (alongside `stackMatch`/`priority` in `main.ts`), so records self-heal on the first post-deploy scrape. The dashboard's raw `JSON.parse` loader treats a missing `exposure` as `unknown` (badge hidden).

## Engine

New module `packages/shared/src/version-ranges.ts` and `packages/shared/src/exposure.ts`; `stack-matcher.ts`'s `scoreStackMatch` is reimplemented on top of them.

### Range evaluator (`version-ranges.ts`)

```ts
type RangeVerdict = 'in' | 'out' | 'partial' | 'unknown';
function evaluateRange(ecosystem: Ecosystem, installed: string, range: string): RangeVerdict;
```

- **npm** — use `semver`. Treat comma as **AND** (intersection); OR only on explicit `||`. Pinned installed version → `in`/`out`. If installed is itself a range, fall to the overlap logic below.
- **composer** — translate Composer constraint syntax (`^`, `~`, `*`/`.x`, hyphen ranges, comma-AND, `||`-OR, stability suffixes) to `semver`-evaluable ranges for the common cases. When the **installed value is a constraint** (e.g. `^6.4`) rather than a pin, compute **overlap** between the installed constraint and the vulnerable range:
  - fully contained / guaranteed-intersecting → `in`
  - provably disjoint → `out`
  - partial / cannot prove either way → `partial`
  - untranslatable input → `unknown`
- **other ecosystems** (`pypi`, `generic`, `ai-llm`, `infrastructure`) — no reliable range semantics here; return `unknown` (caller maps a name match to `potential`).

**Implementation decision (resolve in plan):** in-house Composer→semver translator built on the existing `semver` dependency (recommended — avoids a fragile/unmaintained Composer-version dependency) vs. pulling a library. Default: in-house translator with `partial`/`unknown` fallback for anything it can't confidently translate.

### Verdict computation (`exposure.ts`)

`evaluateExposure(vuln, stackIndex): { exposure: Exposure; stackMatch: StackMatch }`

1. For each `aff` in `vuln.affected`, look up `stackIndex.byName.get(aff.package.toLowerCase())`. (Match by package name — ecosystems rarely collide given the namespaced Composer keys; record `aff.ecosystem` on the result. Ecosystem-aware tie-breaking is a noted refinement, not required.)
2. For each matched entry, derive a per-entry status:
   - `evaluateRange(...)` = `in`, **and** not already past `fixedIn` (installed ≥ `fixedIn`) → **affected**
   - `out`, **or** installed ≥ `fixedIn` → **safe**
   - `partial` → **potential**
   - `unknown` → **potential** (package is yours; range undecidable)
3. **Aggregate** across all matched entries to the strongest: `affected > potential > safe`. Record the deciding entry's `package`/`ecosystem`/`installed`/`vulnerableRange`/`fixedIn`, and collect all matched package names into `stackMatch.packages`.
4. If **no** affected entry matched a stack dep → fall back to today's **topic-mention** text scan (`title`+`summary`). Hit → `exposure.status = 'unknown'`, `stackMatch = { score: 40, reason: 'topic-mention' }`. Miss → `unknown`, `stackMatch.score = 0`.

`stackMatch.score` derived from verdict for back-compat: affected → 100, potential → 60, safe → 20, topic-mention → 40, none → 0 (reason `direct-dep` for the first three, `topic-mention`/`topic-mention` for the rest).

### Wiring (`apps/scraper/src/main.ts`)

Replace the `scoreStackMatch` call (currently line ~135) so each vuln gets both `exposure` and `stackMatch` from `evaluateExposure`, then `computePriority` as today:

```ts
combined = combined.map((v) => {
  const { exposure, stackMatch } = evaluateExposure(v, stackIndex);
  const withMatch = { ...v, exposure, stackMatch };
  return { ...withMatch, priority: computePriority(withMatch) };
});
```

## Scoring change

`packages/shared/src/scoring-config.ts` — add tunable knobs (initial values, tune later):

```ts
floors: { kev: 85, affected: 75 },
demoteWhenIrrelevantFactor: 0.4,
demoteWhenSafeFactor: 0.25,
```

`apps/scraper/src/pipeline/score.ts` — verdict-aware:

- **safe** → `total *= demoteWhenSafeFactor` (provably-not-affected pushed far down — the core noise fix).
- **affected** + severity `high`/`critical` → `total = max(total, floors.affected)` (a confirmed hit can't be buried).
- **potential** / **unknown** → scored via the derived `stackMatch.score` as today.
- Existing `stackMatch.score === 0 → *demoteWhenIrrelevantFactor` (unless `ai-llm`) and `kev` floor are retained.

## Dashboard surfacing (minimal)

- **`apps/dashboard/components/ExposureBadge.tsx`** (new) — renders status: **Affected** (red), **Potential** (amber), **Safe** (muted), **unknown** (hidden). When `status === 'affected'` and `fixedIn` present, append "patch: `<fixedIn>`".
- **`apps/dashboard/components/VulnRow.tsx`** — render `<ExposureBadge>` near the severity pill.
- **`apps/dashboard/lib/store.ts`** — add `affectedOnly: boolean` to `Filters` (default `false`); include in `DEFAULT_FILTERS` and `partialize`; bump `persist` version `2 → 3` (older persisted state lacking the field simply defaults).
- **`apps/dashboard/components/FilterSidebar.tsx`** — an "Affected only" toggle.
- **`apps/dashboard/components/VulnListView.tsx`** — when `filters.affectedOnly`, keep only `v.exposure?.status === 'affected'`.

## Files touched

**shared:** `constants.ts`, `schemas.ts`, `scoring-config.ts`, `stack-matcher.ts` (reimplemented), new `version-ranges.ts`, new `exposure.ts`.
**scraper:** `pipeline/score.ts`, `main.ts`.
**dashboard:** new `components/ExposureBadge.tsx`, `components/VulnRow.tsx`, `lib/store.ts`, `components/FilterSidebar.tsx`, `components/VulnListView.tsx`.
**tests:** new `packages/shared/src/__tests__/version-ranges.test.ts`, new `packages/shared/src/__tests__/exposure.test.ts`, extend scraper scoring tests (mirror `pipeline/__tests__/relevance-filter.test.ts`).

## Testing

- **Range evaluator** — per ecosystem: pinned-in-range, pinned-out-of-range, constraint-vs-range overlap (`in`/`out`/`partial`), comma-as-AND, `||`-as-OR, hyphen ranges, `*`/`.x` wildcards, `fixedIn` boundary (installed == fixedIn → safe), prerelease handling, untranslatable → `unknown`.
- **Verdict aggregation** — order-independence (affected after safe still wins); multiple matched packages collected; safe-vs-affected-vs-potential precedence; topic-mention fallback; no-match → 0.
- **Scoring** — safe demoted below an unrelated medium; affected+critical floored; potential unchanged; existing irrelevant-demote and KEV floor still hold.
- **Golden snapshot** — verdicts over a fixed sample of real `vulns.json` entries, to catch regressions.

## Acceptance criteria

1. A vuln whose only stack match is a **safe** version is demoted below unrelated medium-severity items (no longer surfaces as if relevant).
2. A vuln with an **exact in-range** hit reports `exposure.status === 'affected'` with `package`/`installed`/`vulnerableRange` populated, regardless of `affected[]` ordering.
3. A backend Composer constraint (`^6.4`) overlapping a vulnerable range reports `potential` (not a false `affected`).
4. Comma-AND ranges evaluate as intersection, not union.
5. Dashboard shows the badge and the "Affected only" filter returns only `affected` vulns.
6. `pnpm typecheck` and the test suite pass; existing `vulns.json` loads without migration.

## Open decisions

1. **Composer comparator** — in-house translator (default/recommended) vs. dependency. Resolve in the implementation plan.
2. **Scoring constants** — `floors.affected = 75`, `demoteWhenSafeFactor = 0.25` are initial values, tunable after observing real output.
3. **Ecosystem-aware name matching** — match-by-name is the baseline; ecosystem tie-breaking is an optional refinement if collisions appear.
