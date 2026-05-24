# Irrelevance Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a normalize-time relevance filter so academic preprints, off-stack news/research, and ICS/OT alerts are dropped before they reach `data/vulns.json`.

**Architecture:** Add a `SourceKind` axis to the `Adapter` interface, annotate every existing adapter with one of five kinds, then insert a pure `filterByRelevance` step in `main.ts` between `normalize` and `dedupe`. Track drops in `LastRun.stats.filteredCount`. Provide a one-shot backfill script `pnpm --filter @sec/scraper prune` to clean existing `vulns.json`.

**Tech Stack:** TypeScript (strict, ES2022), Zod schemas in `packages/shared`, Node 22+, pnpm workspaces, tsx for execution, Node's built-in `node --test` runner via `tsx --test` for tests.

**Reference:** See `docs/superpowers/specs/2026-05-24-irrelevance-filter-design.md` for the design rationale.

---

## File Structure

**Modified:**
- `packages/shared/src/schemas.ts` — add `filteredCount` to `LastRun.stats`.
- `apps/scraper/src/adapters/types.ts` — add `SourceKind` union, add `kind` to `Adapter`.
- `apps/scraper/src/adapters/_make-rss-adapter.ts` — accept `kind` in opts and forward.
- All 18 existing adapter files in `apps/scraper/src/adapters/` (one-line `kind: '...'` literal each).
- `apps/scraper/src/main.ts` — wire filter between normalize and dedupe; track filteredCount.
- `apps/scraper/src/cli.ts` — include `filtered=N` in summary line.
- `apps/scraper/package.json` — add `test` and `prune` scripts.

**Created:**
- `apps/scraper/src/pipeline/relevance-filter.ts` — pure filter module.
- `apps/scraper/src/pipeline/__tests__/relevance-filter.test.ts` — test suite using `node:test`.
- `apps/scraper/scripts/prune-irrelevant.ts` — one-shot backfill script.

---

## Task 1: Add filteredCount to LastRun schema

**Files:**
- Modify: `packages/shared/src/schemas.ts:113-119`

- [ ] **Step 1: Add `filteredCount` field to LastRun.stats**

Open `packages/shared/src/schemas.ts`. Find the `LastRun` definition (around line 109). The `stats` object currently has `newCount`, `updatedCount`, `archivedCount`, `droppedCount`, `alertCount`. Add `filteredCount` with a default of 0 so existing `last-run.json` files keep parsing:

Replace:

```ts
  stats: z.object({
    newCount: z.number().int().nonnegative(),
    updatedCount: z.number().int().nonnegative(),
    archivedCount: z.number().int().nonnegative().default(0),
    droppedCount: z.number().int().nonnegative(),
    alertCount: z.number().int().nonnegative(),
  }),
```

With:

```ts
  stats: z.object({
    newCount: z.number().int().nonnegative(),
    updatedCount: z.number().int().nonnegative(),
    archivedCount: z.number().int().nonnegative().default(0),
    droppedCount: z.number().int().nonnegative(),
    filteredCount: z.number().int().nonnegative().default(0),
    alertCount: z.number().int().nonnegative(),
  }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no callers reference `filteredCount` yet; the default makes it backward-compatible).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/schemas.ts
git commit -m "feat(shared): add filteredCount to LastRun.stats"
```

---

## Task 2: Add SourceKind type and kind field to Adapter interface

**Files:**
- Modify: `apps/scraper/src/adapters/types.ts`

- [ ] **Step 1: Add `SourceKind` union and `kind` field**

Open `apps/scraper/src/adapters/types.ts`. Currently:

```ts
import type { Cadence, Vuln } from '@sec/shared';

export interface SourceCursor {
  lastFetchedAt?: string | undefined;
  lastCursor?: string | undefined;
}

export interface FetchResult {
  raw: unknown[];
  nextCursor?: string | undefined;
}

export interface Adapter {
  id: string;
  cadence: Cadence;
  fetch(cursor: SourceCursor): Promise<FetchResult>;
  normalize(raw: unknown): Vuln | null;
}
```

Replace the file with:

```ts
import type { Cadence, Vuln } from '@sec/shared';

export interface SourceCursor {
  lastFetchedAt?: string | undefined;
  lastCursor?: string | undefined;
}

export interface FetchResult {
  raw: unknown[];
  nextCursor?: string | undefined;
}

export type SourceKind = 'advisory' | 'changelog' | 'news' | 'research' | 'alert';

export interface Adapter {
  id: string;
  kind: SourceKind;
  cadence: Cadence;
  fetch(cursor: SourceCursor): Promise<FetchResult>;
  normalize(raw: unknown): Vuln | null;
}

export type EnrichResult = {
  modifiedById: Map<string, Partial<Vuln>>;
  addedVulns?: Vuln[];
};

export interface Enricher {
  id: string;
  cadence: Cadence;
  enrich(vulns: Vuln[]): Promise<EnrichResult>;
}
```

(Keeps existing `EnrichResult` and `Enricher` exports — those are unchanged from the original file. Verify they are preserved in your edit.)

- [ ] **Step 2: Typecheck (expected to fail)**

Run: `pnpm typecheck`
Expected: FAIL with errors in every adapter file ("Property 'kind' is missing in type ..."). This is normal — Task 3 fixes them.

---

## Task 3: Annotate every adapter with its kind

Each adapter gets a single `kind: '<value>'` literal added. The Source-Kind assignments come from the spec §2 table.

**Files:**
- Modify: `apps/scraper/src/adapters/_make-rss-adapter.ts`
- Modify: all 18 adapter files listed below.

- [ ] **Step 1: Update RSS helper to forward `kind`**

Open `apps/scraper/src/adapters/_make-rss-adapter.ts`. Replace the `MakeRssAdapterOpts` interface and the `makeRssAdapter` function with:

```ts
import type { Cadence, Ecosystem, Tag, Vuln } from '@sec/shared';
import { fetchRss, isRecent, type RssItem } from '../pipeline/rss.js';
import type { Adapter, FetchResult, SourceCursor, SourceKind } from './types.js';
import { rssItemToVuln } from './_rss-helpers.js';

export interface MakeRssAdapterOpts {
  id: string;
  kind: SourceKind;
  cadence?: Cadence;
  url: string;
  ecosystems?: Ecosystem[];
  tags?: Tag[];
  severityFromTitle?: boolean;
  filter?: (item: RssItem) => boolean;
  maxAgeDays?: number;
}

export function makeRssAdapter(opts: MakeRssAdapterOpts): Adapter {
  const { id, kind, cadence = 'hourly', url, maxAgeDays } = opts;
  return {
    id,
    kind,
    cadence,
    async fetch(_cursor: SourceCursor): Promise<FetchResult> {
      const items = await fetchRss(url);
      const filtered = items.filter(
        (i) =>
          isRecent(i.isoDate ?? i.pubDate, maxAgeDays) &&
          (opts.filter ? opts.filter(i) : true),
      );
      return { raw: filtered };
    },
    normalize(raw: unknown): Vuln | null {
      const item = raw as RssItem;
      return rssItemToVuln(item, {
        sourceId: id,
        ...(opts.ecosystems ? { ecosystems: opts.ecosystems } : {}),
        ...(opts.tags ? { tags: opts.tags } : {}),
        severityFromTitle: opts.severityFromTitle ?? true,
      });
    },
  };
}
```

- [ ] **Step 2: Annotate advisory adapters (7 files)**

For each of the following files, add `kind: 'advisory',` to the adapter object literal — placement is right after the `id` field. Concrete edits:

**`apps/scraper/src/adapters/ghsa.ts`** — find `export const ghsaAdapter: Adapter = {` then `id: 'ghsa',` and insert below it:
```ts
  kind: 'advisory',
```

**`apps/scraper/src/adapters/nvd.ts`** — find `export const nvdAdapter: Adapter = {` then `id: 'nvd',` and insert below it:
```ts
  kind: 'advisory',
```

**`apps/scraper/src/adapters/cisa-vulnrichment.ts`** — find `export const cisaVulnrichmentAdapter: Adapter = {` then `id: 'cisa-vulnrichment',` and insert below it:
```ts
  kind: 'advisory',
```

**`apps/scraper/src/adapters/packagist.ts`** — find `export const packagistAdapter: Adapter = {` then `id: 'packagist',` and insert below it:
```ts
  kind: 'advisory',
```

**`apps/scraper/src/adapters/osv.ts`** — find the returned object from `makeOsvAdapter`, has `id: 'osv',` — insert below:
```ts
    kind: 'advisory',
```

**`apps/scraper/src/adapters/ghsa-stack.ts`** — find the returned object from `makeGhsaStackAdapter`, has `id: 'ghsa-stack',` — insert below:
```ts
    kind: 'advisory',
```

**`apps/scraper/src/adapters/cve-org.ts`** — find the returned object from `makeCveOrgAdapter`, has `id: 'cve-org',` — insert below:
```ts
    kind: 'advisory',
```

**`apps/scraper/src/adapters/github-repo-advisories.ts`** — find the returned object from `makeGithubRepoAdvisoriesAdapter`, has `id: 'github-repo-advisories',` — insert below:
```ts
    kind: 'advisory',
```

For the RSS-based advisory adapters, add `kind: 'advisory'` to the `makeRssAdapter({...})` call (just below `id:`):

**`apps/scraper/src/adapters/friendsofphp-advisories.ts`** — modify the `makeRssAdapter` call so it starts:
```ts
export const friendsofphpAdvisoriesAdapter = makeRssAdapter({
  id: 'friendsofphp-advisories',
  kind: 'advisory',
  url: 'https://github.com/FriendsOfPHP/security-advisories/commits.atom',
```
(keep the rest of the existing options unchanged)

**`apps/scraper/src/adapters/symfony-security.ts`** — same shape:
```ts
export const symfonySecurityAdapter = makeRssAdapter({
  id: 'symfony-security',
  kind: 'advisory',
  url: 'https://feeds.feedburner.com/symfony/blog',
```

**`apps/scraper/src/adapters/nodejs-security.ts`** — same shape:
```ts
export const nodejsSecurityAdapter = makeRssAdapter({
  id: 'nodejs-security',
  kind: 'advisory',
  url: 'https://nodejs.org/en/feed/vulnerability.xml',
```

**`apps/scraper/src/adapters/php-security.ts`** — same shape:
```ts
export const phpSecurityAdapter = makeRssAdapter({
  id: 'php-security',
  kind: 'advisory',
  url: 'https://www.php.net/feed.atom',
```

(Note: that brings advisory annotations to 12 adapters total — the 7 structured + 5 advisory RSS feeds. All belong to `kind: 'advisory'` per the spec.)

- [ ] **Step 3: Annotate changelog adapters (3 files)**

**`apps/scraper/src/adapters/vercel-changelog.ts`** — modify the `makeRssAdapter` call so it starts:
```ts
export const vercelChangelogAdapter = makeRssAdapter({
  id: 'vercel-changelog',
  kind: 'changelog',
  url: 'https://vercel.com/changelog/rss.xml',
```

**`apps/scraper/src/adapters/nextjs-releases.ts`** — modify:
```ts
export const nextjsReleasesAdapter = makeRssAdapter({
  id: 'nextjs-releases',
  kind: 'changelog',
  url: 'https://github.com/vercel/next.js/releases.atom',
```

**`apps/scraper/src/adapters/cloudflare-blog.ts`** — modify:
```ts
export const cloudflareBlogAdapter = makeRssAdapter({
  id: 'cloudflare-blog',
  kind: 'changelog',
  url: 'https://blog.cloudflare.com/rss/',
```

- [ ] **Step 4: Annotate news + research + alert adapters (5 files actually present)**

The `index.ts` registers the following non-advisory, non-changelog adapters: `cisa-alerts`, `github-security-lab`, `project-zero`, `arxiv-cs-cr`. `thehackernews`, `bleepingcomputer`, and `hackernews` are referenced in the design but are NOT currently in `index.ts` — that's a discrepancy with the live `data/vulns.json` sample (which contains items from those sources). Inspect their existence first:

Run: `ls apps/scraper/src/adapters/ | grep -E "thehackernews|bleepingcomputer|hackernews"`
- If files exist, annotate them with `kind: 'news'`.
- If no files exist, the spec's news bucket is a no-op for now and you skip these.

For each existing file:

**`apps/scraper/src/adapters/cisa-alerts.ts`** — modify:
```ts
export const cisaAlertsAdapter = makeRssAdapter({
  id: 'cisa-alerts',
  kind: 'alert',
  url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
```

**`apps/scraper/src/adapters/github-security-lab.ts`** — modify:
```ts
export const githubSecurityLabAdapter = makeRssAdapter({
  id: 'github-security-lab',
  kind: 'research',
  url: 'https://github.blog/category/security/feed/',
```

**`apps/scraper/src/adapters/project-zero.ts`** — modify:
```ts
export const projectZeroAdapter = makeRssAdapter({
  id: 'project-zero',
  kind: 'research',
  url: 'https://googleprojectzero.blogspot.com/feeds/posts/default',
```

**`apps/scraper/src/adapters/arxiv-cs-cr.ts`** — modify:
```ts
export const arxivCsCrAdapter = makeRssAdapter({
  id: 'arxiv-cs-cr',
  kind: 'research',
  cadence: '6h',
  url: 'https://export.arxiv.org/rss/cs.CR',
```

**For any thehackernews / bleepingcomputer / hackernews file that exists**, add `kind: 'news'` in the same position. If the file does not exist, do nothing — the filter will simply have no input from that source.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. Every adapter now has `kind`.

- [ ] **Step 6: Commit**

```bash
git add apps/scraper/src/adapters/
git commit -m "feat(scraper): tag every adapter with a SourceKind"
```

---

## Task 4: Add a `test` script using node:test via tsx

The project has no test infrastructure yet. Use Node's built-in test runner via `tsx --test` (zero new dependencies; tsx is already a dev dep).

**Files:**
- Modify: `apps/scraper/package.json`

- [ ] **Step 1: Add `test` script**

Open `apps/scraper/package.json`. In the `scripts` block, add:

```json
    "test": "tsx --test src/**/*.test.ts"
```

So the scripts section becomes:

```json
  "scripts": {
    "start": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "tsx --test src/**/*.test.ts"
  },
```

- [ ] **Step 2: Verify the runner works**

Run: `pnpm --filter @sec/scraper test`
Expected: exits 0 with "tests 0, pass 0, fail 0" (no test files yet — that's fine; just confirms tsx's --test flag is wired).

- [ ] **Step 3: Commit**

```bash
git add apps/scraper/package.json
git commit -m "chore(scraper): add node --test runner via tsx"
```

---

## Task 5: Implement relevance-filter module (TDD)

**Files:**
- Create: `apps/scraper/src/pipeline/__tests__/relevance-filter.test.ts`
- Create: `apps/scraper/src/pipeline/relevance-filter.ts`

- [ ] **Step 1: Write the failing test file**

Create `apps/scraper/src/pipeline/__tests__/relevance-filter.test.ts` with the following content:

```ts
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildStackIndex, type Stack } from '@sec/shared';
import {
  filterByRelevance,
  ICS_VENDOR_BLOCKLIST,
  STACK_ECOSYSTEM_KEYWORDS,
} from '../relevance-filter.js';
import type { SourceKind } from '../../adapters/types.js';
import type { Vuln } from '@sec/shared';

const stack: Stack = {
  frontend: { next: '14.0.0', react: '18.0.0', lodash: '4.17.21', '@apollo/client': '3.0.0' },
  backend: { 'symfony/symfony': '^6.4', 'doctrine/orm': '^2.19' },
  tools: { claude: '*' },
};
const idx = buildStackIndex(stack);

function makeVuln(partial: Partial<Vuln> & { sources?: Vuln['sources'] } = {}): Vuln {
  return {
    id: partial.id ?? 'TEST-1',
    aliases: partial.aliases ?? [],
    title: partial.title ?? '',
    summary: partial.summary ?? '',
    severity: partial.severity ?? 'unknown',
    ecosystems: partial.ecosystems ?? [],
    cwe: partial.cwe ?? [],
    affected: partial.affected ?? [],
    stackMatch: partial.stackMatch ?? { score: 0, packages: [], reason: 'topic-mention' },
    priority: partial.priority ?? 0,
    kev: partial.kev ?? false,
    publishedAt: partial.publishedAt ?? '2026-05-24T00:00:00.000Z',
    modifiedAt: partial.modifiedAt ?? '2026-05-24T00:00:00.000Z',
    mergedAt: partial.mergedAt ?? '2026-05-24T00:00:00.000Z',
    sources: partial.sources ?? [
      { source: 'test', externalId: 'test-1', url: 'https://example.com', fetchedAt: '2026-05-24T00:00:00.000Z' },
    ],
    tags: partial.tags ?? [],
  } as Vuln;
}

describe('filterByRelevance: advisory and changelog always pass', () => {
  for (const kind of ['advisory', 'changelog'] as const) {
    it(`passes any ${kind} item regardless of content`, () => {
      const v = makeVuln({ title: 'random product launch with nothing relevant' });
      const verdict = filterByRelevance(v, kind as SourceKind, idx);
      assert.equal(verdict.keep, true);
    });
  }
});

describe('filterByRelevance: news kind requires relevance signal', () => {
  it('keeps news mentioning a CVE id', () => {
    const v = makeVuln({ title: 'CVE-2026-12345 critical RCE in obscure tool', summary: '' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, true);
  });
  it('keeps news mentioning a stack package by name', () => {
    const v = makeVuln({ title: 'lodash prototype pollution found', summary: '' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, true);
  });
  it('keeps news mentioning an ecosystem keyword', () => {
    const v = makeVuln({ title: 'Malicious npm packages drop infostealers', summary: '' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, true);
  });
  it('drops news with no signal', () => {
    const v = makeVuln({ title: 'Botnet operator arrested in Canada', summary: 'Police made an arrest.' });
    const verdict = filterByRelevance(v, 'news', idx);
    assert.equal(verdict.keep, false);
  });
  it('drops off-stack CVE-less reports', () => {
    const v = makeVuln({ title: 'Drupal critical SQL injection flaw', summary: 'Attackers actively exploiting.' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, false);
  });
});

describe('filterByRelevance: research kind', () => {
  it('drops arxiv-cs-cr unconditionally even when content mentions stack', () => {
    const v = makeVuln({
      title: 'Adversarial attacks on Claude and React-based agents',
      sources: [{ source: 'arxiv-cs-cr', externalId: 'x', url: 'https://x', fetchedAt: '2026-05-24T00:00:00.000Z' }],
    });
    assert.equal(filterByRelevance(v, 'research', idx).keep, false);
  });
  it('keeps project-zero items mentioning a stack ecosystem', () => {
    const v = makeVuln({
      title: 'A new attack on the V8 engine that powers Node.js',
      sources: [{ source: 'project-zero', externalId: 'p', url: 'https://x', fetchedAt: '2026-05-24T00:00:00.000Z' }],
    });
    assert.equal(filterByRelevance(v, 'research', idx).keep, true);
  });
  it('drops project-zero items with no stack signal', () => {
    const v = makeVuln({
      title: '0-click exploit chain for the Pixel 10',
      sources: [{ source: 'project-zero', externalId: 'p', url: 'https://x', fetchedAt: '2026-05-24T00:00:00.000Z' }],
    });
    assert.equal(filterByRelevance(v, 'research', idx).keep, false);
  });
  it('keeps github-security-lab items with CVE', () => {
    const v = makeVuln({
      title: 'CVE-2026-99999 found via CodeQL',
      sources: [{ source: 'github-security-lab', externalId: 'g', url: 'https://x', fetchedAt: '2026-05-24T00:00:00.000Z' }],
    });
    assert.equal(filterByRelevance(v, 'research', idx).keep, true);
  });
});

describe('filterByRelevance: alert kind uses ICS blocklist', () => {
  it('drops items led by an ICS vendor name', () => {
    for (const vendor of ICS_VENDOR_BLOCKLIST) {
      const v = makeVuln({ title: `${vendor} industrial controller flaw`, summary: '' });
      assert.equal(filterByRelevance(v, 'alert', idx).keep, false, `expected drop for ${vendor}`);
    }
  });
  it('keeps general CISA bulletins', () => {
    const v = makeVuln({ title: 'CISA Adds One Known Exploited Vulnerability to Catalog', summary: '' });
    assert.equal(filterByRelevance(v, 'alert', idx).keep, true);
  });
});

describe('filterByRelevance: word-boundary edge cases', () => {
  it('does not match "react" inside "reactor"', () => {
    const v = makeVuln({ title: 'nuclear reactor security incident' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, false);
  });
  it('does not match "npm" inside "npms"', () => {
    const v = makeVuln({ title: 'npms.io directory changes' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, false);
  });
  it('matches scoped package via unscoped tail', () => {
    const v = makeVuln({ title: 'Apollo Client memory leak fixed' });
    assert.equal(filterByRelevance(v, 'news', idx).keep, true);
  });
});

describe('exports', () => {
  it('exports STACK_ECOSYSTEM_KEYWORDS', () => {
    assert.ok(STACK_ECOSYSTEM_KEYWORDS.length > 0);
  });
  it('exports ICS_VENDOR_BLOCKLIST', () => {
    assert.ok(ICS_VENDOR_BLOCKLIST.length > 0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @sec/scraper test`
Expected: FAIL with module-not-found errors for `../relevance-filter.js`.

- [ ] **Step 3: Implement `relevance-filter.ts`**

Create `apps/scraper/src/pipeline/relevance-filter.ts` with:

```ts
import type { StackIndex, Vuln } from '@sec/shared';
import type { SourceKind } from '../adapters/types.js';

export type FilterVerdict = { keep: true } | { keep: false; reason: string };

export const STACK_ECOSYSTEM_KEYWORDS: readonly string[] = [
  'npm',
  'composer',
  'symfony',
  'next.js',
  'nextjs',
  'react',
  'vercel',
  'cloudflare',
  'claude',
  'anthropic',
  'openai',
  'php',
  'node.js',
  'nodejs',
];

export const ICS_VENDOR_BLOCKLIST: readonly string[] = [
  'siemens',
  'abb',
  'hitachi',
  'schneider',
  'honeywell',
  'rockwell',
  'mitsubishi',
  'dahua',
  'delta electronics',
  'phoenix contact',
  'wago',
  'beckhoff',
  'omron',
  'yokogawa',
  'emerson',
  'ge digital',
  'ge industrial',
  'allen-bradley',
  'advantech',
  'moxa',
  'opto 22',
];

const CVE_REGEX = /cve-\d{4}-\d+/i;
const MIN_PACKAGE_NAME_LEN = 3;

export function filterByRelevance(
  vuln: Vuln,
  kind: SourceKind,
  stack: StackIndex,
): FilterVerdict {
  switch (kind) {
    case 'advisory':
    case 'changelog':
      return { keep: true };

    case 'news':
      return hasRelevanceSignal(vuln, stack)
        ? { keep: true }
        : { keep: false, reason: 'news: no CVE id, stack package, or ecosystem keyword' };

    case 'research': {
      const sourceId = vuln.sources[0]?.source;
      if (sourceId === 'arxiv-cs-cr') {
        return { keep: false, reason: 'research: arxiv-cs-cr is unconditionally dropped' };
      }
      return hasRelevanceSignal(vuln, stack)
        ? { keep: true }
        : { keep: false, reason: 'research: no CVE id, stack package, or ecosystem keyword' };
    }

    case 'alert':
      return mentionsBlocklistedVendor(vuln)
        ? { keep: false, reason: 'alert: ICS/OT vendor in blocklist' }
        : { keep: true };
  }
}

function hasRelevanceSignal(vuln: Vuln, stack: StackIndex): boolean {
  const haystack = `${vuln.title}\n${vuln.summary}`.toLowerCase();

  if (CVE_REGEX.test(haystack)) return true;

  for (const keyword of STACK_ECOSYSTEM_KEYWORDS) {
    if (containsWord(haystack, keyword.toLowerCase())) return true;
  }

  for (const name of stack.allLower) {
    if (name.length < MIN_PACKAGE_NAME_LEN) continue;
    if (containsWord(haystack, name)) return true;

    // Scoped/namespaced packages: also try the unscoped tail.
    // e.g. "@apollo/client" -> "client"; "symfony/symfony" -> "symfony".
    const tail = unscopedTail(name);
    if (tail && tail.length >= MIN_PACKAGE_NAME_LEN && tail !== name) {
      if (containsWord(haystack, tail)) return true;
    }
  }

  return false;
}

function mentionsBlocklistedVendor(vuln: Vuln): boolean {
  const haystack = `${vuln.title} ${vuln.summary}`.toLowerCase();
  return ICS_VENDOR_BLOCKLIST.some((vendor) => haystack.includes(vendor));
}

function containsWord(haystack: string, needle: string): boolean {
  let idx = 0;
  while (idx < haystack.length) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) return false;
    const before = found === 0 ? '' : haystack[found - 1] ?? '';
    const afterIdx = found + needle.length;
    const after = afterIdx >= haystack.length ? '' : haystack[afterIdx] ?? '';
    if (!isWordChar(before) && !isWordChar(after)) return true;
    idx = found + 1;
  }
  return false;
}

function isWordChar(ch: string): boolean {
  if (!ch) return false;
  return /[a-z0-9]/i.test(ch);
}

function unscopedTail(name: string): string {
  const slash = name.lastIndexOf('/');
  if (slash === -1) return '';
  return name.slice(slash + 1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sec/scraper test`
Expected: PASS for all test cases. If any test fails, the most likely culprits:
- `containsWord` mis-handling boundary chars — fix `isWordChar` regex.
- Scoped-tail logic missing a case — verify `unscopedTail('symfony/symfony')` returns `'symfony'`.
- ICS test failing on a multi-word vendor like `delta electronics` — the test uses `.includes`, which already handles spaces.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/scraper/src/pipeline/relevance-filter.ts apps/scraper/src/pipeline/__tests__/relevance-filter.test.ts
git commit -m "feat(scraper): relevance filter dropping off-stack and non-vuln items"
```

---

## Task 6: Wire filter into main.ts

**Files:**
- Modify: `apps/scraper/src/main.ts`

- [ ] **Step 1: Import the filter**

Open `apps/scraper/src/main.ts`. After the existing `import { dispatchAlerts } from '@/notify/dispatch.js';` line, add:

```ts
import { filterByRelevance } from '@/pipeline/relevance-filter.js';
```

- [ ] **Step 2: Add `filteredCount` to `RunReport`**

Find the `RunReport` interface (around line 41). Add `filteredCount: number;` after `droppedCount`:

```ts
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
```

- [ ] **Step 3: Build a per-source `kind` lookup and apply the filter**

Find the normalize loop (around line 84):

```ts
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
```

Replace it with:

```ts
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
```

(`kindBySourceId` covers all live adapters; the fallback `?? 'advisory'` is defensive and only triggers if `index.ts` desyncs from the runtime list.)

- [ ] **Step 4: Pass `filteredCount` into `LastRun` and the report**

Find the `lastRun` assembly (around line 150):

```ts
    stats: { newCount, updatedCount, archivedCount, droppedCount, alertCount },
```

Replace with:

```ts
    stats: { newCount, updatedCount, archivedCount, droppedCount, filteredCount, alertCount },
```

Find the function's return value (around line 170):

```ts
  return {
    newCount,
    updatedCount,
    archivedCount,
    droppedCount,
    alertCount,
    durationMs: lastRun.durationMs,
    errors,
  };
```

Replace with:

```ts
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
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Re-run the relevance-filter tests** (sanity check — they shouldn't have regressed)

Run: `pnpm --filter @sec/scraper test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/scraper/src/main.ts
git commit -m "feat(scraper): wire relevance filter into pipeline"
```

---

## Task 7: Surface `filtered=N` in the CLI summary

**Files:**
- Modify: `apps/scraper/src/cli.ts:53-55`

- [ ] **Step 1: Update the summary line**

Open `apps/scraper/src/cli.ts`. Find the `console.warn` summary call (around line 53):

```ts
  console.warn(
    `scrape: new=${report.newCount} updated=${report.updatedCount} archived=${report.archivedCount} dropped=${report.droppedCount} alerts=${report.alertCount} duration=${report.durationMs}ms`,
  );
```

Replace with:

```ts
  console.warn(
    `scrape: new=${report.newCount} updated=${report.updatedCount} archived=${report.archivedCount} dropped=${report.droppedCount} filtered=${report.filteredCount} alerts=${report.alertCount} duration=${report.durationMs}ms`,
  );
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/scraper/src/cli.ts
git commit -m "feat(scraper): show filtered count in CLI summary"
```

---

## Task 8: Backfill script — `prune-irrelevant.ts`

**Files:**
- Create: `apps/scraper/scripts/prune-irrelevant.ts`
- Modify: `apps/scraper/package.json` (add `prune` script)

- [ ] **Step 1: Write the script**

Create `apps/scraper/scripts/prune-irrelevant.ts`:

```ts
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
```

- [ ] **Step 2: Add `prune` script to package.json**

Open `apps/scraper/package.json`. Add a `prune` script under `scripts`:

```json
    "prune": "tsx scripts/prune-irrelevant.ts"
```

Final `scripts` section:

```json
  "scripts": {
    "start": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "tsx --test src/**/*.test.ts",
    "prune": "tsx scripts/prune-irrelevant.ts"
  },
```

- [ ] **Step 3: Typecheck** (the script is in a sibling dir; verify the `tsconfig` includes scripts or that tsx handles it standalone)

Run: `pnpm typecheck`
Expected: PASS. The `apps/scraper/tsconfig.json` `include` is `["src/**/*"]` — `scripts/` is not in the typecheck scope, so the script ships without affecting `pnpm typecheck`. tsx will compile it at runtime.

- [ ] **Step 4: Commit**

```bash
git add apps/scraper/scripts/prune-irrelevant.ts apps/scraper/package.json
git commit -m "feat(scraper): one-shot prune script for existing vulns.json"
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Dry-run the scraper to confirm filter wires through**

Run: `pnpm --filter @sec/scraper start -- --dry-run`
Expected: summary line includes `filtered=N` where N ≥ 0. If N is 0, the run fetched no `news` / `research` / `alert` items (possible on a clean run); proceed.

- [ ] **Step 2: Run the prune script against current `data/vulns.json`**

Run: `pnpm --filter @sec/scraper prune`
Expected:
- `prune: BEFORE -> AFTER (dropped N)` line where N is roughly the count of arxiv-cs-cr items plus ICS-vendor cisa-alerts items plus off-stack project-zero items plus news items with no signal — based on the current data sample, expect N in the range of ~50-80.
- Per-source breakdown showing arxiv-cs-cr losing all 42 of its items (or whatever the current count is).
- `data/vulns.json` is rewritten with the survivors.

Verify with PowerShell:

```powershell
$vulns = Get-Content data/vulns.json -Raw | ConvertFrom-Json
"Total: $($vulns.Count)"
$vulns | Group-Object { $_.sources[0].source } | Sort-Object Count -Descending | Select-Object Count, Name | Format-Table -AutoSize
($vulns | Where-Object { $_.sources[0].source -eq 'arxiv-cs-cr' }).Count
```

Expected: arxiv-cs-cr count is 0.

- [ ] **Step 3: Commit the pruned data**

```bash
git add data/vulns.json
git commit -m "chore: prune irrelevant items from vulns.json"
```

- [ ] **Step 4: Final typecheck and test pass**

Run in parallel:
```
pnpm typecheck
pnpm --filter @sec/scraper test
```
Expected: both PASS.

---

## Self-Review Notes (planner's record)

- **Spec §1 (scope)** → covered by Task 3 (kind annotations) and Task 5 (filter implementation).
- **Spec §2 (kind taxonomy)** → covered by Task 2 (type) and Task 3 (annotations).
- **Spec §3 (relevance signal)** → covered by Task 5 (`hasRelevanceSignal`).
- **Spec §4 (ICS blocklist)** → covered by Task 5 (`ICS_VENDOR_BLOCKLIST` constant + `mentionsBlocklistedVendor`).
- **Spec §5 (pipeline wiring)** → covered by Task 6.
- **Spec §5.4 (stats / observability)** → covered by Task 1 (schema), Task 6 (count), Task 7 (CLI summary).
- **Spec §6 (backfill)** → covered by Task 8.
- **Spec §7 (testing)** → covered by Task 4 (runner) and Task 5 (test suite).
- **Spec §8 (acceptance)** → covered by Task 9.
- **Placeholder scan:** no TODO/TBD/fill-in remaining; every step has runnable code and commands.
- **Type-consistency check:** `SourceKind` is defined once in `adapters/types.ts` and imported wherever used. `filterByRelevance` signature is identical in the implementation, tests, main wiring, and prune script. `filteredCount` is added to both `LastRun.stats` and `RunReport` (and surfaced in the CLI summary).
- **Live-codebase discrepancy:** spec §1 lists `thehackernews`, `bleepingcomputer`, `hackernews` as in-scope `news` sources; current `index.ts` does not register them, but the live `data/vulns.json` contains items from those source IDs (likely from a prior config). Task 3 Step 4 inspects the filesystem and only annotates what exists. The prune script handles any source ID present in vulns.json via the `?? 'advisory'` fallback (which means historical items from unregistered sources are kept conservatively, not dropped).
