# Credible Sources Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 5 community/news adapters, rename one adapter, add 5 credible/official adapters (symfony-security, npm-blog, github-repo-advisories, cve-org, cisa-vulnrichment), and expand packagist/osv package query lists.

**Architecture:** All changes confined to `apps/scraper/src/adapters/`. Each new adapter implements the existing `Adapter` interface (`id`, `cadence`, `fetch`, `normalize`). Registration happens in `apps/scraper/src/adapters/index.ts`. Data pipeline, dedupe, scoring, and notifications are untouched.

**Tech Stack:** TypeScript (Node 22+ ESM), `undici` for HTTP, `rss-parser` for atom/RSS feeds, `cheerio` for HTML fallback, existing `makeRssAdapter` helper for simple RSS sources, existing `_html-helpers.ts` if HTML scraping needed.

**Verification approach:** Codebase has no test framework yet. Each task verifies via:
- `pnpm typecheck` (compile correctness)
- `pnpm lint` (ESLint)
- `pnpm scrape --source=<adapter-id> --dry-run --no-notify` (smoke test: confirms the adapter fetches, normalizes, and produces records without writing or notifying)

**Spec:** `docs/superpowers/specs/2026-05-22-credible-sources-revision-design.md`

---

## Task 1: Remove `hackernews` adapter

**Files:**
- Delete: `apps/scraper/src/adapters/hackernews.ts`
- Modify: `apps/scraper/src/adapters/index.ts` (remove import + array entry)

- [ ] **Step 1: Delete the adapter file**

```bash
git rm apps/scraper/src/adapters/hackernews.ts
```

- [ ] **Step 2: Remove from `index.ts`**

Open `apps/scraper/src/adapters/index.ts`. Remove these two occurrences:

Line ~8: delete the import line:
```typescript
import { hackernewsAdapter } from './hackernews.js';
```

Inside the `ADAPTERS` array: delete the line:
```typescript
  hackernewsAdapter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/scraper/src/adapters/index.ts
git commit -m "refactor(adapters): remove hackernews community aggregator

Per credible-sources spec — Hacker News is a community aggregator, not a
primary security disclosure source."
```

---

## Task 2: Remove `thehackernews` adapter

**Files:**
- Delete: `apps/scraper/src/adapters/thehackernews.ts`
- Modify: `apps/scraper/src/adapters/index.ts`

- [ ] **Step 1: Delete the adapter file**

```bash
git rm apps/scraper/src/adapters/thehackernews.ts
```

- [ ] **Step 2: Remove from `index.ts`**

Remove the import line:
```typescript
import { thehackernewsAdapter } from './thehackernews.js';
```

Remove from `ADAPTERS` array:
```typescript
  thehackernewsAdapter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/scraper/src/adapters/index.ts
git commit -m "refactor(adapters): remove thehackernews secondary news source

Per credible-sources spec — TheHackerNews is for-profit security
journalism, not a primary disclosure source."
```

---

## Task 3: Remove `bleepingcomputer` adapter

**Files:**
- Delete: `apps/scraper/src/adapters/bleepingcomputer.ts`
- Modify: `apps/scraper/src/adapters/index.ts`

- [ ] **Step 1: Delete the adapter file**

```bash
git rm apps/scraper/src/adapters/bleepingcomputer.ts
```

- [ ] **Step 2: Remove from `index.ts`**

Remove:
```typescript
import { bleepingcomputerAdapter } from './bleepingcomputer.js';
```

And from `ADAPTERS`:
```typescript
  bleepingcomputerAdapter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/scraper/src/adapters/index.ts
git commit -m "refactor(adapters): remove bleepingcomputer secondary news source

Per credible-sources spec — secondary news outlet; primary disclosures
reach us via GHSA/CVE first."
```

---

## Task 4: Remove `mastodon-cve` and `mastodon-zeroday` adapters

**Files:**
- Delete: `apps/scraper/src/adapters/mastodon-cve.ts`
- Modify: `apps/scraper/src/adapters/index.ts`

The file `mastodon-cve.ts` exports both `mastodonCveAdapter` and `mastodonZeroDayAdapter`. Both go in one task.

- [ ] **Step 1: Delete the adapter file**

```bash
git rm apps/scraper/src/adapters/mastodon-cve.ts
```

- [ ] **Step 2: Remove from `index.ts`**

Remove the import:
```typescript
import { mastodonCveAdapter, mastodonZeroDayAdapter } from './mastodon-cve.js';
```

And the two array entries:
```typescript
  mastodonCveAdapter,
  mastodonZeroDayAdapter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/scraper/src/adapters/index.ts
git commit -m "refactor(adapters): remove mastodon hashtag aggregators

Per credible-sources spec — community hashtag aggregation lacks editorial
standard. Removes both mastodon-cve and mastodon-zeroday adapters."
```

---

## Task 5: Rename `symfony-blog` → `friendsofphp-advisories`

**Files:**
- Rename: `apps/scraper/src/adapters/symfony-blog.ts` → `apps/scraper/src/adapters/friendsofphp-advisories.ts`
- Modify: `apps/scraper/src/adapters/index.ts`

- [ ] **Step 1: Git-rename and edit the file**

```bash
git mv apps/scraper/src/adapters/symfony-blog.ts apps/scraper/src/adapters/friendsofphp-advisories.ts
```

- [ ] **Step 2: Update the file's internals**

Open `apps/scraper/src/adapters/friendsofphp-advisories.ts` and replace the whole file contents with:

```typescript
import { makeRssAdapter } from './_make-rss-adapter';

// FriendsOfPHP/security-advisories is the canonical machine-readable list of
// PHP security advisories (Symfony + Doctrine + Twig + broader PHP).
// commits.atom surfaces every new advisory as a commit.
export const friendsofphpAdvisoriesAdapter = makeRssAdapter({
  id: 'friendsofphp-advisories',
  url: 'https://github.com/FriendsOfPHP/security-advisories/commits.atom',
  ecosystems: ['composer'],
  tags: ['backend', 'symfony'],
  filter: (item) => {
    const t = (item.title + ' ' + (item.contentSnippet ?? '')).toLowerCase();
    return /symfony|doctrine|twig|guzzle|laravel|monolog|cve-|advisor|add /i.test(t);
  },
});
```

- [ ] **Step 3: Update `index.ts`**

Open `apps/scraper/src/adapters/index.ts`. Change the import line from:
```typescript
import { symfonyBlogAdapter } from './symfony-blog.js';
```
to:
```typescript
import { friendsofphpAdvisoriesAdapter } from './friendsofphp-advisories.js';
```

And change the `ADAPTERS` array entry from:
```typescript
  symfonyBlogAdapter,
```
to:
```typescript
  friendsofphpAdvisoriesAdapter,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 6: Smoke test**

Run: `pnpm scrape --source=friendsofphp-advisories --dry-run --no-notify`
Expected: stdout shows `scrape: new=<N> updated=0 ...` with N ≥ 0 (may be 0 if no recent commits, that's fine). No `errors:` line.

- [ ] **Step 7: Commit**

```bash
git add apps/scraper/src/adapters/friendsofphp-advisories.ts apps/scraper/src/adapters/index.ts
git commit -m "refactor(adapters): rename symfony-blog to friendsofphp-advisories

The adapter pulls the FriendsOfPHP/security-advisories commits feed, not
the Symfony team's blog. New id reflects the actual source."
```

---

## Task 6: Expand `packagist.ts` PACKAGES list

**Files:**
- Modify: `apps/scraper/src/adapters/packagist.ts`

- [ ] **Step 1: Replace the PACKAGES array**

Open `apps/scraper/src/adapters/packagist.ts`. Find the `const PACKAGES = [...]` block (~line 30). Replace its contents with:

```typescript
const PACKAGES = [
  'symfony/symfony',
  'symfony/http-kernel',
  'symfony/security-bundle',
  'symfony/security-http',
  'symfony/security-core',
  'symfony/security-csrf',
  'symfony/serializer',
  'symfony/console',
  'symfony/dependency-injection',
  'symfony/messenger',
  'symfony/http-foundation',
  'symfony/form',
  'symfony/validator',
  'symfony/process',
  'symfony/yaml',
  'symfony/translation',
  'doctrine/orm',
  'doctrine/dbal',
  'doctrine/migrations',
  'doctrine/cache',
  'twig/twig',
  'guzzlehttp/guzzle',
  'monolog/monolog',
  'api-platform/core',
  'sensiolabs/security-checker',
];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Smoke test**

Run: `pnpm scrape --source=packagist --dry-run --no-notify`
Expected: stdout shows `scrape: new=<N> updated=0 ...` with N ≥ 0. No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/scraper/src/adapters/packagist.ts
git commit -m "feat(packagist): expand Symfony/Doctrine package coverage

Add symfony/console, /messenger, /serializer, /http-foundation,
/security-{http,core,csrf}, /form, /validator, /process, /yaml,
/translation, /dependency-injection; doctrine/{dbal,migrations,cache};
api-platform/core, sensiolabs/security-checker. 9 -> 25 packages."
```

---

## Task 7: Expand `osv.ts` Packagist QUERIES list

**Files:**
- Modify: `apps/scraper/src/adapters/osv.ts`

- [ ] **Step 1: Replace the QUERIES array**

Open `apps/scraper/src/adapters/osv.ts`. Find the `const QUERIES: ...` block (~line 36). Replace its contents with:

```typescript
const QUERIES: { name: string; ecosystem: 'npm' | 'Packagist' }[] = [
  { name: 'next', ecosystem: 'npm' },
  { name: 'react', ecosystem: 'npm' },
  { name: '@apollo/client', ecosystem: 'npm' },
  { name: 'antd', ecosystem: 'npm' },
  { name: 'axios', ecosystem: 'npm' },
  { name: 'lodash', ecosystem: 'npm' },
  { name: 'firebase', ecosystem: 'npm' },
  { name: 'lexical', ecosystem: 'npm' },
  { name: 'tinymce', ecosystem: 'npm' },
  { name: 'zod', ecosystem: 'npm' },
  { name: 'graphql', ecosystem: 'npm' },
  { name: 'symfony/symfony', ecosystem: 'Packagist' },
  { name: 'symfony/http-kernel', ecosystem: 'Packagist' },
  { name: 'symfony/security-bundle', ecosystem: 'Packagist' },
  { name: 'symfony/security-http', ecosystem: 'Packagist' },
  { name: 'symfony/serializer', ecosystem: 'Packagist' },
  { name: 'symfony/console', ecosystem: 'Packagist' },
  { name: 'symfony/messenger', ecosystem: 'Packagist' },
  { name: 'symfony/http-foundation', ecosystem: 'Packagist' },
  { name: 'symfony/form', ecosystem: 'Packagist' },
  { name: 'symfony/validator', ecosystem: 'Packagist' },
  { name: 'doctrine/orm', ecosystem: 'Packagist' },
  { name: 'doctrine/dbal', ecosystem: 'Packagist' },
  { name: 'doctrine/migrations', ecosystem: 'Packagist' },
  { name: 'twig/twig', ecosystem: 'Packagist' },
  { name: 'guzzlehttp/guzzle', ecosystem: 'Packagist' },
  { name: 'api-platform/core', ecosystem: 'Packagist' },
  { name: 'monolog/monolog', ecosystem: 'Packagist' },
];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Smoke test**

Run: `pnpm scrape --source=osv --dry-run --no-notify`
Expected: stdout shows `scrape: new=<N> updated=0 ...` with N ≥ 0. No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/scraper/src/adapters/osv.ts
git commit -m "feat(osv): expand Symfony/Doctrine query coverage

Mirror packagist expansion: add symfony/* components, doctrine/dbal,
doctrine/migrations, api-platform/core, monolog/monolog to OSV queries.
4 -> 17 Packagist queries (npm queries unchanged)."
```

---

## Task 8: Add `symfony-security` adapter (RSS)

**Files:**
- Create: `apps/scraper/src/adapters/symfony-security.ts`
- Modify: `apps/scraper/src/adapters/index.ts`

- [ ] **Step 1: Create the adapter file**

Create `apps/scraper/src/adapters/symfony-security.ts` with:

```typescript
import { makeRssAdapter } from './_make-rss-adapter';

// Official Symfony blog, security-advisories category. Each post is a CVE
// disclosure written by the Symfony core team.
export const symfonySecurityAdapter = makeRssAdapter({
  id: 'symfony-security',
  url: 'https://symfony.com/blog/category/security-advisories.atom',
  ecosystems: ['composer'],
  tags: ['backend', 'symfony'],
  severityFromTitle: true,
});
```

- [ ] **Step 2: Register in `index.ts`**

Open `apps/scraper/src/adapters/index.ts`.

Add to the imports block (after the `friendsofphpAdvisoriesAdapter` import):
```typescript
import { symfonySecurityAdapter } from './symfony-security.js';
```

Add to the `ADAPTERS` array (place after `friendsofphpAdvisoriesAdapter`):
```typescript
  symfonySecurityAdapter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 5: Smoke test**

Run: `pnpm scrape --source=symfony-security --dry-run --no-notify`
Expected: stdout shows `scrape: new=<N> updated=0 ...` with N ≥ 0. No errors.

If the atom feed 404s (the smoke test reports `errors: 1` with `symfony-security/fetch`), the URL needs verification. Fallback options in spec section 7.1, but skip the fallback unless the primary genuinely fails.

- [ ] **Step 6: Commit**

```bash
git add apps/scraper/src/adapters/symfony-security.ts apps/scraper/src/adapters/index.ts
git commit -m "feat(adapters): add symfony-security official advisory feed

Pulls https://symfony.com/blog/category/security-advisories.atom — the
Symfony team's official security blog category. Earliest official
disclosure channel for Symfony CVEs."
```

---

## Task 9: Add `npm-blog` adapter (RSS, filtered)

**Files:**
- Create: `apps/scraper/src/adapters/npm-blog.ts`
- Modify: `apps/scraper/src/adapters/index.ts`

- [ ] **Step 1: Create the adapter file**

Create `apps/scraper/src/adapters/npm-blog.ts` with:

```typescript
import { makeRssAdapter } from './_make-rss-adapter';

// Official npm Inc. blog. Mixed content — keyword filter narrows to
// security-relevant posts (advisories, malware, supply-chain).
export const npmBlogAdapter = makeRssAdapter({
  id: 'npm-blog',
  url: 'https://blog.npmjs.org/feed/',
  ecosystems: ['npm'],
  tags: ['frontend'],
  filter: (item) => {
    const t = (item.title + ' ' + (item.contentSnippet ?? '')).toLowerCase();
    return /security|vulnerab|advisor|cve-|malware|supply.chain/i.test(t);
  },
});
```

- [ ] **Step 2: Register in `index.ts`**

Add the import:
```typescript
import { npmBlogAdapter } from './npm-blog.js';
```

Add to `ADAPTERS` array:
```typescript
  npmBlogAdapter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 5: Smoke test**

Run: `pnpm scrape --source=npm-blog --dry-run --no-notify`
Expected: stdout shows `scrape: new=<N> updated=0 ...` with N ≥ 0. No errors. N is likely 0 — npm blog posts security items rarely; that's expected and not a failure.

- [ ] **Step 6: Commit**

```bash
git add apps/scraper/src/adapters/npm-blog.ts apps/scraper/src/adapters/index.ts
git commit -m "feat(adapters): add npm-blog official feed

Pulls https://blog.npmjs.org/feed/ filtered to security/advisory/malware
keywords. Low frequency but official npm Inc. channel."
```

---

## Task 10: Add `github-repo-advisories` adapter

**Files:**
- Create: `apps/scraper/src/adapters/github-repo-advisories.ts`
- Modify: `apps/scraper/src/adapters/index.ts`

- [ ] **Step 1: Create the adapter file**

Create `apps/scraper/src/adapters/github-repo-advisories.ts` with:

```typescript
import type { Ecosystem, Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import {
  canonicalId,
  cleanText,
  cvssToSeverity,
  deriveSeverity,
  normalizeAffected,
  toIsoDate,
} from '../pipeline/normalize.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

const REPOS = [
  // Symfony / PHP backend
  'symfony/symfony',
  'doctrine/orm',
  'doctrine/dbal',
  'twig/twig',
  // npm / frontend frameworks + libs
  'vercel/next.js',
  'facebook/react',
  'apollographql/apollo-client',
  'axios/axios',
  'lodash/lodash',
  'ant-design/ant-design',
  'lexical-lsp/lexical',
  // npm / Node ecosystem
  'nodejs/node',
  'npm/cli',
  'vitejs/vite',
  'microsoft/TypeScript',
  'colinhacks/zod',
  'getsentry/sentry-javascript',
  'firebase/firebase-js-sdk',
  'tinymce/tinymce',
];

interface RepoAdvisory {
  ghsa_id: string;
  cve_id?: string | null;
  summary: string;
  description: string;
  severity: string;
  cvss?: { score?: number | null; vector_string?: string | null };
  cwe_ids?: string[];
  identifiers?: { type: string; value: string }[];
  vulnerabilities?: {
    package: { ecosystem: string; name: string };
    vulnerable_version_range: string;
    patched_versions?: string | null;
  }[];
  references?: ({ url: string } | string)[];
  published_at: string;
  updated_at: string;
  html_url: string;
  state?: string;
}

interface RawItem {
  repo: string;
  advisory: RepoAdvisory;
}

const ECO_MAP: Record<string, Ecosystem> = {
  npm: 'npm',
  composer: 'composer',
  pip: 'pypi',
  pypi: 'pypi',
};

function mapEcosystem(e: string): Ecosystem {
  return ECO_MAP[e.toLowerCase()] ?? 'generic';
}

function githubHeaders(): Record<string, string> {
  const token = process.env['GITHUB_TOKEN'] || process.env['SCRAPER_PAT'];
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return headers;
}

export const githubRepoAdvisoriesAdapter: Adapter = {
  id: 'github-repo-advisories',
  cadence: 'hourly',

  async fetch(cursor: SourceCursor): Promise<FetchResult> {
    const sinceMs = cursor.lastFetchedAt
      ? new Date(cursor.lastFetchedAt).getTime()
      : Date.now() - 24 * 3600_000;
    const headers = githubHeaders();
    const all: RawItem[] = [];

    for (const repo of REPOS) {
      try {
        const items = await fetchJson<RepoAdvisory[]>(
          `https://api.github.com/repos/${repo}/security-advisories?state=published&per_page=100`,
          { headers, retries: 2 },
        );
        for (const a of items) {
          const t = new Date(a.updated_at).getTime();
          if (Number.isNaN(t) || t < sinceMs) continue;
          all.push({ repo, advisory: a });
        }
      } catch {
        // per-repo failure is non-fatal; continue with the next repo
      }
    }

    return { raw: all };
  },

  normalize(raw: unknown): Vuln | null {
    const item = raw as RawItem | null;
    if (!item || !item.advisory?.ghsa_id) return null;
    const a = item.advisory;

    const cvssScore = a.cvss?.score ?? undefined;
    const severity =
      cvssScore !== undefined && cvssScore > 0
        ? cvssToSeverity(cvssScore)
        : deriveSeverity({ ghsaSeverity: a.severity });

    const ecosystems = new Set<Ecosystem>();
    const affected = (a.vulnerabilities ?? []).map((v) => {
      const eco = mapEcosystem(v.package.ecosystem);
      ecosystems.add(eco);
      return normalizeAffected({
        ecosystem: eco,
        package: v.package.name,
        versions: v.vulnerable_version_range || 'any',
        ...(v.patched_versions ? { fixedIn: v.patched_versions } : {}),
      });
    });

    const aliases = (a.identifiers ?? [])
      .map((i) => i.value)
      .filter((v) => v !== a.ghsa_id);

    const tags: Vuln['tags'] = [];
    for (const aff of affected) {
      if (aff.ecosystem === 'npm') tags.push('frontend');
      if (aff.ecosystem === 'composer') tags.push('backend');
      if (aff.package.startsWith('symfony/')) tags.push('symfony');
      if (aff.package === 'next') tags.push('nextjs');
    }

    const vuln: Vuln = {
      id: canonicalId({ cveId: a.cve_id ?? undefined, ghsaId: a.ghsa_id }),
      ghsaId: a.ghsa_id,
      aliases,
      title: cleanText(a.summary || a.ghsa_id),
      summary: cleanText(a.summary || ''),
      details: cleanText(a.description || ''),
      severity,
      ecosystems: [...ecosystems],
      cwe: a.cwe_ids ?? [],
      affected,
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0,
      kev: false,
      publishedAt: toIsoDate(a.published_at),
      modifiedAt: toIsoDate(a.updated_at),
      mergedAt: new Date().toISOString(),
      sources: [
        {
          source: 'github-repo-advisories',
          externalId: `${item.repo}:${a.ghsa_id}`,
          url: a.html_url,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags: [...new Set(tags)],
    };
    if (a.cve_id) vuln.cveId = a.cve_id;
    if (cvssScore !== undefined) vuln.cvss = cvssScore;
    if (a.cvss?.vector_string) vuln.cvssVector = a.cvss.vector_string;
    return vuln;
  },
};
```

- [ ] **Step 2: Register in `index.ts`**

Add the import:
```typescript
import { githubRepoAdvisoriesAdapter } from './github-repo-advisories.js';
```

Add to `ADAPTERS` array (place near the `ghsaAdapter` entry, after `npmBlogAdapter`):
```typescript
  githubRepoAdvisoriesAdapter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 5: Smoke test**

Run: `pnpm scrape --source=github-repo-advisories --dry-run --no-notify`
Expected: stdout shows `scrape: new=<N> updated=0 ...` with N ≥ 0. Without a `GITHUB_TOKEN` env var set the per-repo requests will hit the 60 req/h unauthenticated quota and many calls will fail silently (the adapter swallows per-repo errors); set `GITHUB_TOKEN` for a meaningful smoke test:

```bash
GITHUB_TOKEN=<your-pat> pnpm scrape --source=github-repo-advisories --dry-run --no-notify
```

On a PowerShell session use:
```powershell
$env:GITHUB_TOKEN='<your-pat>'; pnpm scrape --source=github-repo-advisories --dry-run --no-notify
```

- [ ] **Step 6: Commit**

```bash
git add apps/scraper/src/adapters/github-repo-advisories.ts apps/scraper/src/adapters/index.ts
git commit -m "feat(adapters): add github-repo-advisories

Pulls GET /repos/{owner}/{repo}/security-advisories for 19 stack repos
(symfony/symfony, doctrine/orm, twig/twig, vercel/next.js, facebook/react,
plus 14 more). Catches maintainer-filed advisories ahead of propagation
to the global GHSA index. Requires GITHUB_TOKEN for full rate."
```

---

## Task 11: Add `cve-org` adapter

The implementation uses the **`CVEProject/cvelistV5` GitHub commits approach** per the spec's section 7.4 — the listing endpoint on `cveawg.mitre.org/api/cve` is mentioned in the spec but its behavior is unverified, while the GitHub commits approach is reliable.

**Files:**
- Create: `apps/scraper/src/adapters/cve-org.ts`
- Modify: `apps/scraper/src/adapters/index.ts`

- [ ] **Step 1: Create the adapter file**

Create `apps/scraper/src/adapters/cve-org.ts` with:

```typescript
import type { Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import {
  canonicalId,
  cleanText,
  cvssToSeverity,
  toIsoDate,
} from '../pipeline/normalize.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

const REPO = 'CVEProject/cvelistV5';
const KEYWORDS = [
  'symfony', 'doctrine', 'twig', 'guzzlehttp', 'monolog',
  'next.js', 'nextjs', 'react ', 'apollo', 'antd', 'ant design',
  'axios', 'lodash', 'lexical', 'tinymce', 'zod', 'firebase-js',
  'sentry-javascript', 'typescript', 'vite ', 'node.js',
];
const KEY_RE = new RegExp(KEYWORDS.map((k) => k.replace(/[.+]/g, '\\$&')).join('|'), 'i');

interface CommitListItem {
  sha: string;
  commit: { author: { date: string } };
}

interface CommitDetail {
  sha: string;
  files: { filename: string; status: 'added' | 'modified' | 'removed' }[];
}

interface CveRecord {
  cveMetadata?: {
    cveId?: string;
    state?: string;
    datePublished?: string;
    dateUpdated?: string;
    cnaPublishedDate?: string;
  };
  containers?: {
    cna?: {
      title?: string;
      descriptions?: { lang: string; value: string }[];
      metrics?: {
        cvssV3_1?: { baseScore?: number; vectorString?: string };
        cvssV3_0?: { baseScore?: number; vectorString?: string };
      }[];
      problemTypes?: { descriptions: { lang: string; cweId?: string; description: string }[] }[];
      references?: { url: string }[];
    };
  };
}

interface RawCveItem {
  sha: string;
  path: string;
  cveId: string;
  record: CveRecord;
}

function githubHeaders(): Record<string, string> {
  const token = process.env['GITHUB_TOKEN'] || process.env['SCRAPER_PAT'];
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return headers;
}

export const cveOrgAdapter: Adapter = {
  id: 'cve-org',
  cadence: 'hourly',

  async fetch(cursor: SourceCursor): Promise<FetchResult> {
    const since =
      cursor.lastFetchedAt ?? new Date(Date.now() - 2 * 3600_000).toISOString();
    const headers = githubHeaders();

    let commits: CommitListItem[];
    try {
      commits = await fetchJson<CommitListItem[]>(
        `https://api.github.com/repos/${REPO}/commits?since=${encodeURIComponent(since)}&per_page=100`,
        { headers, retries: 2 },
      );
    } catch {
      return { raw: [] };
    }

    const seen = new Set<string>();
    const items: RawCveItem[] = [];

    for (const c of commits) {
      let detail: CommitDetail;
      try {
        detail = await fetchJson<CommitDetail>(
          `https://api.github.com/repos/${REPO}/commits/${c.sha}`,
          { headers, retries: 2 },
        );
      } catch {
        continue;
      }
      for (const f of detail.files) {
        if (f.status === 'removed') continue;
        const m = f.filename.match(/cves\/\d{4}\/[^/]+\/(CVE-\d{4}-\d+)\.json$/);
        if (!m) continue;
        const cveId = m[1]!;
        if (seen.has(cveId)) continue;
        seen.add(cveId);

        const rawUrl = `https://raw.githubusercontent.com/${REPO}/${c.sha}/${f.filename}`;
        try {
          const record = await fetchJson<CveRecord>(rawUrl, { retries: 1 });
          items.push({ sha: c.sha, path: f.filename, cveId, record });
        } catch {
          // individual file fetch can fail; skip
        }
      }
    }

    return { raw: items };
  },

  normalize(raw: unknown): Vuln | null {
    const item = raw as RawCveItem | null;
    if (!item || !item.record?.cveMetadata?.cveId) return null;

    const cna = item.record.containers?.cna ?? {};
    const descEn =
      cna.descriptions?.find((d) => d.lang.startsWith('en'))?.value ??
      cna.descriptions?.[0]?.value ??
      '';

    const titleAndDesc = `${cna.title ?? ''} ${descEn}`;
    if (!KEY_RE.test(titleAndDesc)) return null;

    const metric =
      cna.metrics?.find((m) => m.cvssV3_1) ??
      cna.metrics?.find((m) => m.cvssV3_0);
    const cvss = metric?.cvssV3_1?.baseScore ?? metric?.cvssV3_0?.baseScore;
    const vector =
      metric?.cvssV3_1?.vectorString ?? metric?.cvssV3_0?.vectorString;
    const severity = cvssToSeverity(cvss);

    const cwes = (cna.problemTypes ?? [])
      .flatMap((p) => p.descriptions)
      .map((d) => d.cweId ?? '')
      .filter((c) => c.startsWith('CWE-'));

    const refUrl =
      cna.references?.[0]?.url ??
      `https://www.cve.org/CVERecord?id=${item.cveId}`;

    const publishedAt =
      item.record.cveMetadata.cnaPublishedDate ??
      item.record.cveMetadata.datePublished;
    const modifiedAt =
      item.record.cveMetadata.dateUpdated ?? publishedAt;

    const vuln: Vuln = {
      id: canonicalId({ cveId: item.cveId }),
      cveId: item.cveId,
      aliases: [item.cveId],
      title: cleanText((cna.title ?? descEn.slice(0, 200)) || item.cveId),
      summary: cleanText(descEn),
      severity,
      ecosystems: ['generic'],
      cwe: cwes,
      affected: [],
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0,
      kev: false,
      publishedAt: toIsoDate(publishedAt),
      modifiedAt: toIsoDate(modifiedAt),
      mergedAt: new Date().toISOString(),
      sources: [
        {
          source: 'cve-org',
          externalId: item.cveId,
          url: refUrl,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags: [],
    };
    if (cvss !== undefined) vuln.cvss = cvss;
    if (vector) vuln.cvssVector = vector;
    return vuln;
  },
};
```

- [ ] **Step 2: Register in `index.ts`**

Add the import:
```typescript
import { cveOrgAdapter } from './cve-org.js';
```

Add to `ADAPTERS` array (place after `nvdAdapter` since both pull CVE data):
```typescript
  cveOrgAdapter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 5: Smoke test**

Set `GITHUB_TOKEN` (PowerShell):
```powershell
$env:GITHUB_TOKEN='<your-pat>'; pnpm scrape --source=cve-org --dry-run --no-notify
```

Or bash:
```bash
GITHUB_TOKEN=<your-pat> pnpm scrape --source=cve-org --dry-run --no-notify
```

Expected: stdout shows `scrape: new=<N> ...` with N ≥ 0. Without a token the commits API hits the 60 req/h limit and fails — token is effectively required for this adapter.

- [ ] **Step 6: Commit**

```bash
git add apps/scraper/src/adapters/cve-org.ts apps/scraper/src/adapters/index.ts
git commit -m "feat(adapters): add cve-org direct CVE pickup

Discovers new CVE records via CVEProject/cvelistV5 commits API, fetches
raw JSON, filters by stack keywords. Catches CVE filings before NVD
enrichment lag (often days). Uses commits approach over the search API
because cveawg.mitre.org/api/cve listing is unverified."
```

---

## Task 12: Add `cisa-vulnrichment` adapter

**Files:**
- Create: `apps/scraper/src/adapters/cisa-vulnrichment.ts`
- Modify: `apps/scraper/src/adapters/index.ts`

- [ ] **Step 1: Create the adapter file**

Create `apps/scraper/src/adapters/cisa-vulnrichment.ts` with:

```typescript
import type { Tag, Vuln } from '@sec/shared';
import { fetchJson } from '../pipeline/fetch.js';
import {
  canonicalId,
  cleanText,
  cvssToSeverity,
  toIsoDate,
} from '../pipeline/normalize.js';
import type { Adapter, FetchResult, SourceCursor } from './types.js';

const REPO = 'cisagov/vulnrichment';

interface CommitListItem {
  sha: string;
  commit: { author: { date: string } };
}

interface CommitDetail {
  sha: string;
  files: { filename: string; status: 'added' | 'modified' | 'removed' }[];
}

interface VulnrichmentRecord {
  cveMetadata?: {
    cveId?: string;
    datePublished?: string;
    dateUpdated?: string;
  };
  containers?: {
    cna?: {
      title?: string;
      descriptions?: { lang: string; value: string }[];
      metrics?: {
        cvssV3_1?: { baseScore?: number; vectorString?: string };
      }[];
    };
    adp?: Array<{
      providerMetadata?: { shortName?: string };
      title?: string;
      metrics?: Array<{
        cvssV3_1?: { baseScore?: number; vectorString?: string };
        other?: { type?: string; content?: { id?: string } };
      }>;
    }>;
  };
}

interface RawItem {
  sha: string;
  path: string;
  cveId: string;
  record: VulnrichmentRecord;
}

function githubHeaders(): Record<string, string> {
  const token = process.env['GITHUB_TOKEN'] || process.env['SCRAPER_PAT'];
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return headers;
}

export const cisaVulnrichmentAdapter: Adapter = {
  id: 'cisa-vulnrichment',
  cadence: '6h',

  async fetch(cursor: SourceCursor): Promise<FetchResult> {
    const since =
      cursor.lastFetchedAt ?? new Date(Date.now() - 24 * 3600_000).toISOString();
    const headers = githubHeaders();

    let commits: CommitListItem[];
    try {
      commits = await fetchJson<CommitListItem[]>(
        `https://api.github.com/repos/${REPO}/commits?since=${encodeURIComponent(since)}&per_page=100`,
        { headers, retries: 2 },
      );
    } catch {
      return { raw: [] };
    }

    const seen = new Set<string>();
    const items: RawItem[] = [];

    for (const c of commits) {
      let detail: CommitDetail;
      try {
        detail = await fetchJson<CommitDetail>(
          `https://api.github.com/repos/${REPO}/commits/${c.sha}`,
          { headers, retries: 2 },
        );
      } catch {
        continue;
      }

      for (const f of detail.files) {
        if (f.status === 'removed') continue;
        const m = f.filename.match(/\d{4}\/[^/]+\/(CVE-\d{4}-\d+)\.json$/);
        if (!m) continue;
        const cveId = m[1]!;
        if (seen.has(cveId)) continue;
        seen.add(cveId);

        const rawUrl = `https://raw.githubusercontent.com/${REPO}/${c.sha}/${f.filename}`;
        try {
          const record = await fetchJson<VulnrichmentRecord>(rawUrl, { retries: 1 });
          items.push({ sha: c.sha, path: f.filename, cveId, record });
        } catch {
          // skip individual failure
        }
      }
    }

    return { raw: items };
  },

  normalize(raw: unknown): Vuln | null {
    const item = raw as RawItem | null;
    if (!item || !item.record?.cveMetadata?.cveId) return null;

    const cna = item.record.containers?.cna ?? {};
    const adp = item.record.containers?.adp ?? [];

    const descEn =
      cna.descriptions?.find((d) => d.lang.startsWith('en'))?.value ?? '';

    const cnaMetric = cna.metrics?.find((m) => m.cvssV3_1);
    const adpMetric = adp.flatMap((a) => a.metrics ?? []).find((m) => m.cvssV3_1);
    const cvss = adpMetric?.cvssV3_1?.baseScore ?? cnaMetric?.cvssV3_1?.baseScore;
    const vector =
      adpMetric?.cvssV3_1?.vectorString ?? cnaMetric?.cvssV3_1?.vectorString;
    const severity = cvssToSeverity(cvss);

    const kev = adp.some((a) =>
      (a.metrics ?? []).some(
        (m) => m.other?.type === 'kev' || m.other?.content?.id === 'KEV',
      ),
    );

    const tags: Tag[] = kev ? ['exploited'] : [];

    const vuln: Vuln = {
      id: canonicalId({ cveId: item.cveId }),
      cveId: item.cveId,
      aliases: [item.cveId],
      title: cleanText((cna.title ?? descEn.slice(0, 200)) || item.cveId),
      summary: cleanText(descEn),
      severity,
      ecosystems: ['generic'],
      cwe: [],
      affected: [],
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0,
      kev,
      publishedAt: toIsoDate(item.record.cveMetadata.datePublished),
      modifiedAt: toIsoDate(
        item.record.cveMetadata.dateUpdated ?? item.record.cveMetadata.datePublished,
      ),
      mergedAt: new Date().toISOString(),
      sources: [
        {
          source: 'cisa-vulnrichment',
          externalId: item.cveId,
          url: `https://github.com/${REPO}/blob/main/${item.path}`,
          fetchedAt: new Date().toISOString(),
        },
      ],
      tags,
    };
    if (cvss !== undefined) vuln.cvss = cvss;
    if (vector) vuln.cvssVector = vector;
    return vuln;
  },
};
```

- [ ] **Step 2: Register in `index.ts`**

Add the import:
```typescript
import { cisaVulnrichmentAdapter } from './cisa-vulnrichment.js';
```

Add to `ADAPTERS` array (place after `cisaAlertsAdapter`):
```typescript
  cisaVulnrichmentAdapter,
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 5: Smoke test**

```powershell
$env:GITHUB_TOKEN='<your-pat>'; pnpm scrape --source=cisa-vulnrichment --dry-run --no-notify
```

Expected: stdout shows `scrape: new=<N> ...` with N ≥ 0. CISA pushes batched updates so N may be 0 in many runs; that's expected.

- [ ] **Step 6: Commit**

```bash
git add apps/scraper/src/adapters/cisa-vulnrichment.ts apps/scraper/src/adapters/index.ts
git commit -m "feat(adapters): add cisa-vulnrichment

Pulls cisagov/vulnrichment commits, fetches enriched CVE JSON records,
extracts CISA's ADP container (CVSS, KEV indicator). Adds the official
US government enrichment signal for CVEs not yet processed by NVD."
```

---

## Task 13: Full end-to-end smoke test

Run the entire pipeline in dry-run mode to verify all adapters work together — no removed adapter remains, all new adapters produce output, no compile or runtime errors.

- [ ] **Step 1: Run full dry-run scrape**

PowerShell:
```powershell
$env:GITHUB_TOKEN='<your-pat>'; pnpm scrape --dry-run --no-notify
```

Bash:
```bash
GITHUB_TOKEN=<your-pat> pnpm scrape --dry-run --no-notify
```

Expected: stdout shows aggregate `scrape: new=<N> updated=<M> ...`. The `errors:` block (if any) should not contain any source ID from `{hackernews, thehackernews, bleepingcomputer, mastodon-cve, mastodon-zeroday}`. It should not be missing entries for newly added adapters.

- [ ] **Step 2: Verify each new source appears in last-run output**

The dry-run does not write `last-run.json`, so inspect stdout. Each of `symfony-security`, `npm-blog`, `github-repo-advisories`, `cve-org`, `cisa-vulnrichment`, `friendsofphp-advisories` should have been touched (either as a successful fetch or — for `npm-blog` which often returns 0 filtered items — at least not in the errors list).

If a new adapter shows up in errors, debug it via `pnpm scrape --source=<id> --dry-run --no-notify`.

- [ ] **Step 3: No commit unless an issue was found**

If a fix was needed, commit it with a `fix(adapters): <description>` message. Otherwise this task produces no commit.

---

## Task 14: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Note the GITHUB_TOKEN dependency for new adapters**

Open `README.md`. The current "Required secrets" table already mentions `GITHUB_TOKEN`. Update its description to note that it's used by multiple adapters now, not just GHSA:

Find:
```markdown
| `GITHUB_TOKEN` | Auto-provided, used for GHSA API |
```

Replace with:
```markdown
| `GITHUB_TOKEN` | Auto-provided, used by ghsa, github-repo-advisories, cve-org, cisa-vulnrichment adapters |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): note expanded GITHUB_TOKEN usage

GHSA was the only adapter requiring the token; now github-repo-advisories,
cve-org, and cisa-vulnrichment also need it."
```

---

## Done

All spec requirements implemented. Final adapter count: 25 (matches spec section 4). Verify with:

```bash
git log --oneline -20
```

You should see ~12 commits added by this plan (4 removals + 1 rename + 2 expansions + 5 additions + 1 readme).
