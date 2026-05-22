# Credible-Sources Revision — Design Specification

**Date:** 2026-05-22
**Status:** Draft (pending user review)
**Author:** brainstorming session
**Supersedes (partially):** Section 5 of `2026-05-22-security-scraper-design.md`

---

## 1. Purpose

Tighten the scraper's source list so every adapter pulls from a **primary**, **credible**, **at-least-somewhat-official** origin. Remove community aggregators and secondary news outlets that dilute the signal-to-noise ratio. Add five new official sources, expand two existing query lists, and rename one adapter whose identifier no longer matches its underlying feed.

The driving requirement: **catch advisories earlier** — at the time of disclosure, not after a news outlet rephrases them.

## 2. Goals & Non-Goals

### Goals

1. Every active adapter sources from a CNA, vendor, package registry, government body, standards organisation, or recognised research venue.
2. Earlier pickup of Symfony and npm-ecosystem advisories via per-repository GitHub Security Advisory endpoints.
3. Earlier pickup of CVE filings via the CVE.org Services API, bypassing NVD enrichment lag.
4. Broader Symfony component coverage in Packagist and OSV queries.
5. One renamed adapter (`symfony-blog` → `friendsofphp-advisories`) so the source identifier reflects the actual feed.

### Non-Goals

- No dashboard or UI changes — that work is tracked separately in the mobile-usability spec.
- No notification/alert logic changes.
- No score-formula changes.
- No retroactive deletion of historical `vulns.json` records sourced from the removed adapters; they stay in the rolling 90-day window until natural expiry.

## 3. Current State Audit

| Adapter | Origin | Credibility verdict |
|---|---|---|
| `ghsa` | GitHub Security Advisory Database REST API | **Primary** — GitHub is a CNA |
| `osv` | osv.dev REST API (Google) | **Primary** — canonical alias graph |
| `nvd` | services.nvd.nist.gov | **Primary** — NIST government source |
| `packagist` | packagist.org security advisories API | **Primary** — official PHP package registry |
| `cisa-alerts` | cisa.gov advisories XML | **Primary** — US government |
| `php-security` | php.net atom feed | **Primary** — language vendor |
| `nodejs-security` | nodejs.org security feed | **Primary** — runtime vendor |
| `nextjs-releases` | vercel/next.js releases | **Primary** — framework vendor |
| `vercel-changelog` | vercel.com changelog | **Primary** — platform vendor |
| `cloudflare-blog` | blog.cloudflare.com | **Primary** — vendor research |
| `anthropic-trust` | trust.anthropic.com | **Primary** — vendor |
| `openai-security` | openai.com/security | **Primary** — vendor |
| `github-security-lab` | github.blog/category/security | **Primary** — vendor research blog |
| `project-zero` | googleprojectzero.blogspot.com | **Primary** — research team |
| `symfony-blog` | FriendsOfPHP commits.atom | **Primary** but **misnamed** — feed is FriendsOfPHP, not Symfony's blog |
| `mitre-atlas` | atlas.mitre.org | **Primary** — MITRE |
| `owasp-llm` | OWASP project releases | **Primary** — OWASP |
| `avid` | avidml.org | **Credible** — research consortium |
| `hackerone-ai` | hackerone hacktivity AI-tagged | **Primary** — bug-bounty disclosures |
| `arxiv-cs-cr` | arxiv.org cs.CR | **Credible** — academic preprint venue |
| `hackernews` | news.ycombinator.com search | **Secondary/community** — to remove |
| `thehackernews` | thehackernews.com RSS | **Secondary news** — to remove |
| `bleepingcomputer` | bleepingcomputer.com RSS | **Secondary news** — to remove |
| `mastodon-cve` | infosec.exchange #cve | **Community chatter** — to remove |
| `mastodon-zeroday` | infosec.exchange #zeroday | **Community chatter** — to remove |

## 4. Changes Summary

| Change type | Count | Net |
|---|---|---|
| Adapters removed | 5 | -5 |
| Adapters renamed | 1 | 0 |
| Adapters added | 5 | +5 |
| Existing adapters with expanded query lists | 2 | 0 |
| **Total active adapters after** | 25 | (was 25) |

`ENRICHERS` (`epss`, `cisa-kev`) are unaffected — they run on the deduped record set, not as feeds.

## 5. Removals

The following adapters are deleted entirely. Their TypeScript files are removed from `apps/scraper/src/adapters/` and their imports/registrations removed from `apps/scraper/src/adapters/index.ts`.

- `hackernews.ts`
- `thehackernews.ts`
- `bleepingcomputer.ts`
- `mastodon-cve.ts` (both `mastodonCveAdapter` and `mastodonZeroDayAdapter` exports)

Test fixtures for these adapters under `__fixtures__/` (if any) are also removed.

**Persistence side-effects:**

- `data/sources.json` entries for these IDs become orphaned. They are inert (no adapter references them) but harmless; we leave them in place to preserve historical record. A small cleanup commit may be made to remove them post-deploy if desired.
- `data/vulns.json` records whose `sources[].source` matches a removed adapter remain in the rolling 90-day window. The dedupe/scoring pipeline does not touch them. They will roll into the monthly archive naturally.
- `data/alerted.json` references to removed-source vulns remain valid (no schema changes).

## 6. Rename

`apps/scraper/src/adapters/symfony-blog.ts` → `apps/scraper/src/adapters/friendsofphp-advisories.ts`.

Inside the file, the adapter's `id` changes from `'symfony-blog'` to `'friendsofphp-advisories'`. The feed URL (`https://github.com/FriendsOfPHP/security-advisories/commits.atom`) is unchanged.

Update `apps/scraper/src/adapters/index.ts` import and the `ADAPTERS` array entry.

**Persistence side-effect:** the `symfony-blog` key in `data/sources.json` becomes orphaned; a new `friendsofphp-advisories` key starts fresh on first run after deploy. Cursor reset means the first run after deploy will replay the past 24h of commits (already-deduped against existing `vulns.json` by canonical ID, so no duplicate records appear).

## 7. New Adapters

### 7.1 `symfony-security`

**File:** `apps/scraper/src/adapters/symfony-security.ts`
**Feed:** `https://symfony.com/blog/category/security-advisories.atom`
**Approach:** RSS atom feed via `makeRssAdapter` helper
**Cadence:** `hourly`
**Authority:** Symfony team's official blog — security-advisories category

```typescript
import { makeRssAdapter } from './_make-rss-adapter';

export const symfonySecurityAdapter = makeRssAdapter({
  id: 'symfony-security',
  url: 'https://symfony.com/blog/category/security-advisories.atom',
  ecosystems: ['composer'],
  tags: ['backend', 'symfony'],
  severityFromTitle: true,
});
```

**Fallback if Atom feed is not served:** scrape the HTML category page at `https://symfony.com/blog/category/security-advisories` using `scrapeHtmlList` from `_html-helpers.ts`. Verify endpoint during implementation; only build the fallback if the atom 404s.

### 7.2 `npm-blog`

**File:** `apps/scraper/src/adapters/npm-blog.ts`
**Feed:** `https://blog.npmjs.org/feed/` (RSS 2.0)
**Approach:** RSS adapter with keyword filter — npm blog is mixed marketing + occasional security
**Cadence:** `hourly`
**Authority:** npm Inc. official blog

```typescript
import { makeRssAdapter } from './_make-rss-adapter';

export const npmBlogAdapter = makeRssAdapter({
  id: 'npm-blog',
  url: 'https://blog.npmjs.org/feed/',
  ecosystems: ['npm'],
  tags: ['frontend'],
  filter: (item) => /security|vulnerab|advisor|cve-|malware|supply.chain/i.test(
    item.title + ' ' + (item.contentSnippet ?? ''),
  ),
});
```

### 7.3 `github-repo-advisories`

**File:** `apps/scraper/src/adapters/github-repo-advisories.ts`
**Endpoint:** `GET /repos/{owner}/{repo}/security-advisories?state=published&per_page=100`
**Approach:** Iterate a static repo list; share `GhsaItem` normalize logic with the global `ghsa` adapter
**Cadence:** `hourly`
**Authority:** Maintainer-filed advisories on GitHub — typically populated before propagation to the global `/advisories` index

**Repo list (configurable in-file):**

```typescript
const REPOS = [
  // Symfony / PHP backend
  'symfony/symfony',
  'doctrine/orm',
  'doctrine/dbal',
  'twig/twig',
  // npm / frontend
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
```

**Cursor strategy:** `lastFetchedAt` ISO string. Skip items whose `updated_at < cursor.lastFetchedAt`. Each repo call returns the most recent 100 advisories; for repos with stable advisory counts this is well past the cursor.

**Auth:** uses `GITHUB_TOKEN` (or `SCRAPER_PAT`) just like the existing `ghsa` adapter. Without a token the rate limit is 60 req/h shared with the global IP — insufficient for ~19 repos hourly. With a token it's 5000 req/h. Document the requirement in `README.md`.

**Normalize:** Reuse the `ghsa` adapter's `normalize` logic. The per-repo endpoint returns a `RepositoryAdvisory` object whose fields align with `GhsaItem` already defined in `ghsa.ts`. Extract the shared normalize function into `_ghsa-helpers.ts` if reuse becomes awkward; otherwise inline a thin call.

**Per-item source ID:** `source: 'github-repo-advisories'` with `externalId = '<owner>/<repo>:<ghsa_id>'` so dedupe via canonical ID merges with the global `ghsa` adapter while still tracing back to the per-repo origin.

### 7.4 `cve-org`

**File:** `apps/scraper/src/adapters/cve-org.ts`
**Endpoint (primary):** `GET https://cveawg.mitre.org/api/cve?time_modified.gt={ISO}&state=PUBLISHED&page={n}`
**Endpoint (fallback):** GitHub commits API against `CVEProject/cvelistV5` if the primary listing endpoint returns 404 or unstable schema
**Cadence:** `hourly`
**Authority:** MITRE — the issuing authority for CVE identifiers

**Stack-keyword filter (applied in normalize):**

```typescript
const KEYWORDS = [
  'symfony', 'doctrine', 'twig', 'guzzlehttp', 'monolog',
  'next.js', 'nextjs', 'react', 'apollo', 'antd', 'ant design',
  'axios', 'lodash', 'lexical', 'tinymce', 'zod', 'firebase-js',
  'sentry-javascript', 'typescript', 'vite', 'node.js',
];
```

**Normalize:** Map CVE Services 2.1 `cveRecord` schema to the internal `Vuln` shape. CNA-published containers (`containers.cna.descriptions[]`, `containers.cna.metrics[]`) provide the title, summary, and CVSS. Where present, use `cnaPublishedDate`, otherwise `dateUpdated`.

**Why it's earlier than NVD:** NVD enriches CVE.org records on a 24h–multi-week lag, especially since the 2024 backlog. CVE.org direct catches the initial filing as soon as the CNA publishes it.

**Fallback details:** If the listing endpoint is unreliable, fall back to `GET https://api.github.com/repos/CVEProject/cvelistV5/commits?since={ISO}` → for each commit, `GET /commits/{sha}` to retrieve `files[]` → parse CVE IDs from filenames matching `cves/{year}/{shard}/CVE-{year}-{n}.json` → fetch raw JSON from `https://raw.githubusercontent.com/CVEProject/cvelistV5/{sha}/{path}`. Filter at normalize time by keyword. Volume estimate: 100–300 CVEs/day, post-keyword filter ~5–15 records/hour.

### 7.5 `cisa-vulnrichment`

**File:** `apps/scraper/src/adapters/cisa-vulnrichment.ts`
**Source:** `https://github.com/cisagov/vulnrichment` (public CISA-maintained repo of JSON enrichment records, one file per enriched CVE)
**Approach:** GitHub commits API to discover recent additions/modifications, then fetch raw JSON for each new file
**Cadence:** `6h` (CISA updates batch-wise, not continuously)
**Authority:** US CISA official Vulnrichment program (since 2024)

**Cursor:** `lastFetchedAt` ISO string, used as the GitHub `commits?since=` parameter.

**Fetch sequence:**

1. `GET https://api.github.com/repos/cisagov/vulnrichment/commits?since={cursor}&per_page=100`
2. For each commit SHA, `GET /repos/cisagov/vulnrichment/commits/{sha}` to expand `files[]`
3. Filter to added/modified `.json` files under `2025/`, `2026/`, etc. (year-keyed shards)
4. For each, fetch raw JSON from `https://raw.githubusercontent.com/cisagov/vulnrichment/{sha}/{path}`

**Normalize:** Vulnrichment uses CVE 5.x JSON format with the ADP (Authorized Data Publisher) container `containers.adp[]` set to CISA. Map to `Vuln`. Source label `cisa-vulnrichment`. Tag with `'exploited'` when KEV indicator present in the ADP container.

**Auth:** GitHub token reused.

## 8. Expanded Existing Adapters

### 8.1 `packagist.ts` package list

Current: 9 packages. Target: ~25.

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

Single GET request, multiple `packages[]=` params. Same response handling.

### 8.2 `osv.ts` QUERIES Packagist additions

Mirror the Packagist list for cross-source dedupe. Keep npm queries unchanged.

```typescript
// Added entries (existing npm entries unchanged):
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
{ name: 'doctrine/orm', ecosystem: 'Packagist' },  // existing
{ name: 'doctrine/dbal', ecosystem: 'Packagist' },
{ name: 'doctrine/migrations', ecosystem: 'Packagist' },
{ name: 'twig/twig', ecosystem: 'Packagist' },     // existing
{ name: 'guzzlehttp/guzzle', ecosystem: 'Packagist' },  // existing
{ name: 'api-platform/core', ecosystem: 'Packagist' },
{ name: 'monolog/monolog', ecosystem: 'Packagist' },
```

Each query is a separate `POST https://api.osv.dev/v1/query`. Per-query failures are already swallowed (`catch {}`), so adding queries is incremental risk-free.

## 9. Migration

Single deploy, no schema migrations. Order of operations during implementation:

1. Add new adapter files; register in `index.ts`.
2. Remove the five news/community adapter files; remove from `index.ts`.
3. Rename `symfony-blog.ts` → `friendsofphp-advisories.ts`; update id; update `index.ts`.
4. Expand `packagist.ts` and `osv.ts` package lists.
5. Update `README.md`: source list table, GITHUB_TOKEN requirement note.
6. Run `pnpm scrape --dry-run` locally to validate each new adapter produces records and each removed adapter no longer appears in `last-run.json.sources`.
7. Single commit; deploy via existing GitHub Actions cron.

**Rollback:** revert the commit. Orphaned cursors in `sources.json` are harmless; restoring them on revert restores cursor continuity.

## 10. Testing

| Adapter | Test fixtures | Smoke test |
|---|---|---|
| `symfony-security` | Captured atom feed snapshot | `pnpm scrape --source=symfony-security --dry-run` |
| `npm-blog` | Captured RSS snapshot with mixed marketing + security item | same pattern |
| `github-repo-advisories` | Captured `/repos/symfony/symfony/security-advisories` JSON | dry-run; assert per-repo source IDs in output |
| `cve-org` | Captured listing response + single record response | dry-run; verify keyword filter behaviour |
| `cisa-vulnrichment` | Captured commits list + one JSON file | dry-run; verify ADP container parsing |

Each adapter gets fixture-based normalize tests (happy / empty / malformed) per the existing convention. Fixtures live in `apps/scraper/src/adapters/__fixtures__/<adapter-id>/`.

Full pipeline integration: `pnpm scrape --dry-run` end-to-end completes successfully with all new adapters wired and no removed adapters present.

## 11. Acceptance Criteria

1. The 5 community/news adapter files are deleted and unreferenced in `index.ts`.
2. `symfony-blog.ts` is renamed to `friendsofphp-advisories.ts` with adapter id `friendsofphp-advisories`.
3. 5 new adapter files exist and are registered in `index.ts` with credible primary-source endpoints documented in code comments.
4. `packagist.ts` `PACKAGES` and `osv.ts` `QUERIES` lists are expanded per Section 8.
5. `pnpm scrape --dry-run` completes in < 5 minutes and produces non-zero record counts from each new adapter (modulo legitimately empty hours).
6. `last-run.json.sources` contains 25 keys: 20 retained + 5 added; 5 removed keys are absent.
7. No record in `vulns.json` references a removed source as its sole `sources[]` entry — verified by post-run check.
8. `README.md` source list is updated and accurate.

## 12. Non-Goals / Open Questions

- **EUVD (ENISA European Vulnerability Database).** Live since May 2025 but the API surface is still maturing. Deferred to a follow-up once endpoint stability is confirmed.
- **Snyk, Sonatype OSS Index.** Credible third-party databases, but not "official" in the primary-source sense. Skipped by design.
- **Vendor feeds for Microsoft, Apple, Google Android.** Official, but low stack-match for a Symfony + Next.js stack. Out of scope.
- **National CERTs (NCSC-UK, BSI-DE, JPCERT/CC).** Official but mostly infrastructure-focused. Add later if user requests.
- **PHP-related: Composer security advisories CLI as a source.** Same upstream as Packagist API; redundant.
