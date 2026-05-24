# Irrelevance Filter — Design Specification

**Date:** 2026-05-24
**Status:** Draft (pending user review)
**Author:** brainstorming session

---

## 1. Purpose

The scraper currently emits a non-trivial fraction of items that are not actionable security advisories — academic preprints, news articles about arrests/breaches at other companies, ICS/OT bulletins for industrial control hardware, and off-stack research blog posts. Add a normalize-time filter that drops those before they reach `vulns.json`.

In-scope: `arxiv-cs-cr`, `thehackernews`, `bleepingcomputer`, `hackernews`, `cisa-alerts`, `project-zero`, `github-security-lab`.

Out of scope: marketing changelog feeds (`vercel-changelog`, `cloudflare-blog`, `nextjs-releases`). These are low-volume (8 records total in current `vulns.json`) and the user opted to keep them; the per-adapter keyword filter already handles them well enough.

## 2. Source Kind Taxonomy

A new `kind` field is added to the `Adapter` interface. Each existing adapter declares one of five kinds. The kind is data only — it doesn't change fetch or normalize behavior — and is consumed by the new relevance filter step.

| kind | Adapters | Filter rule |
|---|---|---|
| `advisory` | ghsa, ghsa-stack, osv, nvd, cve-org, cisa-vulnrichment, cisa-kev, packagist, friendsofphp-advisories, symfony-security, nodejs-security, php-security, github-repo-advisories | pass (trust by default) |
| `changelog` | vercel-changelog, nextjs-releases, cloudflare-blog | pass (per-adapter keyword filter is sufficient) |
| `news` | thehackernews, bleepingcomputer, hackernews | pass iff relevance signal present (§3) |
| `research` | arxiv-cs-cr, project-zero, github-security-lab | drop arxiv-cs-cr unconditionally; project-zero and github-security-lab pass iff relevance signal present |
| `alert` | cisa-alerts | drop iff vendor in ICS/OT blocklist (§4) |

Enrichers (`epss`, `kev`) are not adapters and have no kind.

## 3. Relevance Signal (used by `news` and `research`)

A `Vuln` carries a relevance signal if any of the following match against the concatenation of `title` and `summary` (lowercased):

1. **CVE pattern**: regex `/cve-\d{4}-\d{4,}/` matches.
2. **Stack-package mention**: any package name from `stack.json` (frontend ∪ backend ∪ tools keys) appears as a whole word (word-boundary on both sides). Scope-aware: for npm-scoped names like `@apollo/client`, both the full name and the unscoped trailing segment are accepted (so news mentioning "Apollo Client" matches).
3. **Ecosystem keyword**: one of `npm`, `composer`, `symfony`, `next.js`, `nextjs`, `react`, `vercel`, `cloudflare`, `claude`, `anthropic`, `openai`, `php`, `node.js`, `nodejs` appears.

Word boundaries prevent `react` from matching `reactor` or `npm` from matching `npms`. Stack-package matching is case-insensitive and uses the package-name-as-written from `stack.json` plus the unscoped fallback.

## 4. ICS/OT Vendor Blocklist (used by `alert`)

A `Vuln` from `cisa-alerts` is dropped if its `title` (lowercased) starts with or contains any of:

```
siemens, abb, hitachi, schneider, honeywell, rockwell, mitsubishi,
dahua, delta electronics, phoenix contact, wago, beckhoff,
omron, yokogawa, emerson, ge digital, ge industrial,
allen-bradley, advantech, moxa, opto 22
```

This list lives in `apps/scraper/src/pipeline/relevance-filter.ts` as a constant; new entries are added as we observe noise. CISA bulletins for non-ICS topics (general KEV announcements, broad guidance) pass.

## 5. Pipeline Wiring

### 5.1 Adapter interface change

`apps/scraper/src/adapters/types.ts`:

```ts
export type SourceKind = 'advisory' | 'changelog' | 'news' | 'research' | 'alert';

export interface Adapter {
  id: string;
  kind: SourceKind;        // NEW
  cadence: Cadence;
  fetch(cursor: SourceCursor): Promise<FetchResult>;
  normalize(raw: unknown): Vuln | null;
}
```

Every existing adapter file gets a one-line `kind: '...'` literal added. RSS-builder helpers (`_make-rss-adapter.ts`, `makeRssAdapter`) accept and forward `kind`.

### 5.2 New module: `pipeline/relevance-filter.ts`

```ts
export type FilterVerdict = { keep: true } | { keep: false; reason: string };

export function filterByRelevance(
  vuln: Vuln,
  kind: SourceKind,
  stackIndex: StackIndex,
): FilterVerdict;
```

Pure function. Reads only `vuln.title`, `vuln.summary`, `vuln.sources[0].source`, and the stack index. No I/O. Exported `STACK_ECOSYSTEM_KEYWORDS` and `ICS_VENDOR_BLOCKLIST` constants for testing.

### 5.3 main.ts integration

Inside the existing `for (const r of results)` loop in `apps/scraper/src/main.ts` (around line 86), after `normalizeVuln` returns a non-null `parsed`, call `filterByRelevance(parsed, r.adapter.kind, stackIndex)`. If the verdict is `keep: false`, increment a new `filteredCount` and continue.

The filter runs **after** normalize and **before** dedupe so dropped items never enter the merged set.

### 5.4 Stats / observability

Add `filteredCount: number` to `LastRun.stats` (schema + type). The dashboard's run-summary widget gets one new field. Existing `droppedCount` keeps its meaning (normalize failures); `filteredCount` is the new relevance-filter drops. The CLI summary line in `apps/scraper/src/cli.ts` gains `filtered=N`.

For debugging, when `--source=<id>` is passed, log each filter drop with its reason at stderr (not committed to `last-run.json`).

## 6. Backfill

A one-shot script `apps/scraper/scripts/prune-irrelevant.ts` re-applies `filterByRelevance` to the current `data/vulns.json` and writes back the survivors. Invoked manually via `pnpm --filter scraper prune`. Idempotent. Prints a per-source delta summary. Not wired into the hourly workflow — one-time cleanup after deploy.

## 7. Testing

`apps/scraper/src/pipeline/__tests__/relevance-filter.test.ts`:

- 5 hand-picked `advisory` items → all pass.
- 5 hand-picked `changelog` items → all pass.
- For `news`: 4 keep cases (CVE in title, stack package mention, ecosystem keyword, both), 4 drop cases (arrest, op-ed, off-stack CVE summary without CVE id, generic incident).
- For `research`: every arxiv item drops regardless of content; project-zero and github-security-lab follow the news rules.
- For `alert`: 1 keep (general KEV announcement), 1 drop per vendor in the blocklist (parameterized).
- Word-boundary edge cases: `react` does not match `reactor`, `npm` does not match `npms`, scoped names match unscoped tail.

Snapshot-style: a fixture array of 30 items with expected verdicts, asserted whole. Vitest.

A property test asserts: for any `advisory` kind, `filterByRelevance` always returns `keep: true`.

## 8. Acceptance

- `pnpm --filter scraper test` passes including new suite.
- `pnpm --filter scraper start -- --dry-run` runs end-to-end; `last-run.json.stats.filteredCount` is non-zero on a fresh fetch.
- `pnpm --filter scraper prune` reduces existing `vulns.json` count; the delta is reported by source and the surviving set contains zero arxiv-cs-cr items and zero cisa-alerts items whose title leads with a blocklisted vendor.
- Dashboard renders the updated `vulns.json` without errors (no schema breakage from `filteredCount` addition since it's additive with a default).

## 9. Out of Scope

- Marketing-changelog adapters `vercel-changelog`, `cloudflare-blog`, `nextjs-releases` keep their current per-adapter keyword filter; we are not tightening it. (`github-security-lab` is classified as `research`, not `changelog`, and *does* get the new relevance gate — see §2.)
- LLM-based classification (cost + complexity not justified at current volume).
- User-configurable allow/blocklists exposed in the dashboard (future work).
- Re-scoring or re-prioritizing items that survive the filter (scoring is unchanged).
