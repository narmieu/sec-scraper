# Security Vulnerability Scraper — Design Specification

**Date:** 2026-05-22
**Status:** Draft (pending user review)
**Author:** brainstorming session
**Repo:** `/home/narmi/dev/security-scraper` (greenfield)

---

## 1. Purpose

Build a self-hosted security vulnerability tracking tool that:

- Continuously scrapes recent vulnerabilities from a broad set of trusted sources (CVE feeds, ecosystem advisories, vendor blogs, AI/LLM-specific feeds).
- Deduplicates findings across overlapping sources so each logical vulnerability appears exactly once.
- Ranks every vulnerability with a 0-100 priority score derived from severity, freshness, exploit signals, and relevance to a user-defined stack inventory.
- Renders findings in a fast static web dashboard with filtering, search, and per-user mark-as-read state.
- Pushes high-priority alerts (priority ≥ 80 AND stack-match ≥ 60) to Microsoft Teams via Power Automate webhooks.

The user's primary stack:

- **Frontend:** Next.js 14, React 18, Apollo Client, Antd, Radix UI, Tailwind, Zustand, Sentry, Firebase, Lexical, TinyMCE, Zod, plus dozens of supporting npm packages (see `data/stack.json`).
- **Backend:** Symfony (PHP / Packagist ecosystem).
- **Tools:** Claude / Anthropic SDK and other AI tooling — broad AI/LLM-vuln coverage is an explicit requirement.

## 2. Goals & Non-Goals

### Goals

1. Single source of truth for security-relevant signals impacting the user's stack.
2. Hourly refresh cadence using free infrastructure (GitHub Actions + Vercel).
3. Zero-duplicate output across multiple ingestion sources.
4. Auto-prioritization so high-noise sources stay readable.
5. Push alerts only for stack-relevant critical findings (low-noise channel).
6. Full git audit trail of every scrape (data committed to repo).
7. Dedicated AI/LLM section covering Claude, OpenAI, prompt-injection, OWASP LLM Top 10, MITRE ATLAS, AVID.

### Non-Goals

- Not a replacement for `npm audit` / `composer audit` / Dependabot. Those check exact lockfiles; this scraper surfaces *new* advisories and broader ecosystem chatter.
- Not real-time. ~1-hour latency is acceptable.
- Not multi-user with auth. Single-user dashboard, read-state in localStorage.
- Not historical research; rolling 90-day live window plus monthly gzipped archives.
- Not a vulnerability scanner of user's own code (no SAST/DAST).

## 3. Architecture Overview

```
┌──────────────────────── GitHub Actions (hourly cron :07) ────────────────────────┐
│                                                                                   │
│   adapters/ ──▶ fetch ──▶ normalize ──▶ dedupe ──▶ score ──▶ persist ──▶ notify  │
│      │            │          │             │         │          │          │      │
│      │      (httpx,        (Zod          (3-tier   (formula  (git commit)  Teams  │
│      │       rss-parser,    schemas)      keys)     w/ KEV)               webhook │
│      │       cheerio)                                                             │
│      ▼                                                                            │
│   data/sources.json (cursors + circuit breaker per source)                        │
│                                                                                   │
└────────────────────────────────────┬──────────────────────────────────────────────┘
                                     │ git push
                                     ▼
                          ┌─────────── repo main ───────────┐
                          │  data/vulns.json (rolling 90d)  │
                          │  data/archive/YYYY-MM.json.gz   │
                          │  data/alerted.json              │
                          │  data/sources.json              │
                          │  data/last-run.json             │
                          │  data/stack.json                │
                          └────────────────┬────────────────┘
                                           │ Vercel git integration
                                           ▼
                                 ┌────── Vercel CDN ──────┐
                                 │  Next.js 16 static     │
                                 │  output: 'export'      │
                                 │  React 19, Tailwind v4 │
                                 │  Fuse.js, Zustand+LS   │
                                 └────────────────────────┘
                                           ▲
                                           │ HTTPS
                                       user browser
```

**Key properties**

- Pipeline = pure functions composed in `apps/scraper/src/main.ts`.
- Adapters are the only impure boundary; everything downstream is deterministic.
- Git is the database. `data/*.json` files = canonical state, fully diffable per commit.
- Vercel is a renderer, not a backend. No DB connection at runtime.
- One language end-to-end (TypeScript) — shared Zod schemas in `packages/shared`.

## 4. Repository Layout

```
security-scraper/
├── apps/
│   ├── scraper/                          # Node 22 CLI
│   │   ├── src/
│   │   │   ├── adapters/                 # one file per source
│   │   │   │   ├── ghsa.ts
│   │   │   │   ├── osv.ts
│   │   │   │   ├── nvd.ts
│   │   │   │   ├── packagist.ts
│   │   │   │   ├── epss.ts               # enrichment only
│   │   │   │   ├── cisa-kev.ts
│   │   │   │   ├── hackernews.ts
│   │   │   │   ├── thehackernews.ts
│   │   │   │   ├── bleepingcomputer.ts
│   │   │   │   ├── snyk-rss.ts
│   │   │   │   ├── sonatype-rss.ts
│   │   │   │   ├── symfony-blog.ts
│   │   │   │   ├── nextjs-releases.ts
│   │   │   │   ├── avid.ts               # AI/LLM
│   │   │   │   ├── owasp-llm.ts
│   │   │   │   ├── mitre-atlas.ts
│   │   │   │   ├── anthropic-trust.ts
│   │   │   │   ├── openai-security.ts
│   │   │   │   ├── hackerone-ai.ts
│   │   │   │   ├── arxiv-cs-cr.ts
│   │   │   │   └── __fixtures__/<src>/   # test fixtures
│   │   │   ├── pipeline/
│   │   │   │   ├── fetch.ts              # HTTP w/ retry+backoff
│   │   │   │   ├── normalize.ts          # raw → Vuln
│   │   │   │   ├── dedupe.ts             # 3-tier merge
│   │   │   │   ├── score.ts              # priority formula
│   │   │   │   ├── persist.ts            # write JSON + archive rollover
│   │   │   │   └── circuit-breaker.ts
│   │   │   ├── notify/
│   │   │   │   ├── teams.ts
│   │   │   │   ├── email.ts              # Resend
│   │   │   │   ├── webhook.ts            # generic POST
│   │   │   │   └── console.ts
│   │   │   ├── stack.ts                  # load + index stack.json
│   │   │   ├── main.ts                   # orchestrator entry
│   │   │   └── cli.ts                    # arg parsing: --dry-run, --source=
│   │   ├── package.json
│   │   └── vitest.config.ts
│   │
│   └── dashboard/                        # Next.js 16 static
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx                  # All
│       │   ├── frontend/page.tsx
│       │   ├── backend/page.tsx
│       │   ├── ai-llm/page.tsx
│       │   ├── archived/page.tsx
│       │   └── vuln/[id]/page.tsx
│       ├── components/
│       │   ├── VulnRow.tsx
│       │   ├── FilterSidebar.tsx
│       │   ├── SearchBar.tsx
│       │   ├── PriorityBadge.tsx
│       │   ├── SeverityPill.tsx
│       │   ├── StackMatchChips.tsx
│       │   ├── LastUpdated.tsx
│       │   └── SourceHealth.tsx          # footer health dots
│       ├── lib/
│       │   ├── store.ts                  # Zustand + localStorage persist
│       │   ├── search.ts                 # Fuse.js index
│       │   └── data.ts                   # load vulns.json
│       ├── app/globals.css               # @import "tailwindcss"; @theme {}
│       └── next.config.mjs               # output: 'export'
│
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── schemas.ts                # Zod: Vuln, SourceRef, Severity, Ecosystem
│       │   ├── types.ts                  # inferred TS types
│       │   ├── scoring-config.ts         # tunable weights
│       │   └── constants.ts              # source IDs, ecosystems
│       └── package.json
│
├── data/
│   ├── vulns.json                        # rolling 90d, sorted by priority desc
│   ├── archive/
│   │   └── 2026-04.json.gz
│   ├── sources.json                      # per-source cursor + health
│   ├── alerted.json                      # idempotency state for notifications
│   ├── last-run.json                     # latest run stats + errors
│   └── stack.json                        # user inventory
│
├── docs/
│   └── superpowers/
│       ├── specs/2026-05-22-security-scraper-design.md   # this doc
│       └── plans/                        # populated by writing-plans skill
│
├── .github/
│   └── workflows/
│       └── scrape.yml
│
├── scripts/
│   ├── refresh-fixtures.ts               # update adapter test fixtures
│   └── gen-stack-from-package-json.ts    # optional bootstrap (future)
│
├── .husky/pre-commit
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── README.md
└── LICENSE
```

## 5. Source Adapters

### Tier 1 — Structured APIs (hourly, core feed)

| Source | Endpoint | Stable ID | Coverage |
|---|---|---|---|
| GitHub Advisory DB | `api.github.com/advisories` (REST), GraphQL fallback for cursors | `GHSA-xxx` | npm + composer, curated, often first-published |
| OSV.dev | `api.osv.dev/v1/query` + per-ecosystem dumps | `OSV-xxx` | npm, composer, generic — has alias graph for cross-source linking |
| NVD | `services.nvd.nist.gov/rest/json/cves/2.0` | `CVE-xxx` | all CVEs, authoritative CVSS scores |
| Packagist Security Advisories | `packagist.org/api/security-advisories/?packages=symfony/*` | `PKSA-xxx` | Symfony + broader PHP ecosystem |
| EPSS (enrichment) | `api.first.org/data/v1/epss?cve=...` | n/a | exploit prediction score (0..1) per CVE |

### Tier 2 — RSS / Atom feeds (hourly, broad signal)

| Source | Feed | Tag(s) |
|---|---|---|
| HackerNews (security/vulnerability searches) | Algolia HN API | `general` |
| The Hacker News | `feeds.feedburner.com/TheHackersNews` | `general` |
| Bleeping Computer | `bleepingcomputer.com/feed/` | `general` |
| Snyk Vulnerability DB | RSS | `npm`, `composer` |
| Sonatype OSS Index | RSS | `npm`, `composer` |
| CISA Known Exploited Vulnerabilities | `cisa.gov/known-exploited-vulnerabilities.json` | `exploited` (flips KEV flag) |
| Symfony Security Advisories blog | `symfony.com/blog/category/security-advisories.atom` | `symfony` |
| Next.js / Vercel release security entries | GitHub releases RSS | `nextjs` |

### Tier 3 — AI / LLM specific (every 6h, "AI/LLM" tab)

| Source | Method | Coverage |
|---|---|---|
| AVID (AI Vulnerability DB) | `avidml.org` JSON dump | AI taxonomy |
| OWASP LLM Top 10 errata | GitHub repo releases | LLM threat patterns |
| MITRE ATLAS | `atlas.mitre.org` case-study feed | adversarial ML |
| Anthropic Trust Center / security bulletins | RSS or HTML scrape | Claude-specific |
| OpenAI security advisories | `openai.com/security/` HTML | LLM vendor |
| HackerOne disclosed (AI tag) | hacktivity API w/ filter | bug-bounty AI |
| arxiv cs.CR recent | `arxiv.org/list/cs.CR/recent` filtered to AI keywords | research preprints |

### Tier 4 — Opt-in / off by default

- HackerOne general firehose
- Reddit r/netsec, r/sysadmin
- (Future) user-added sources via `data/sources-extra.json`

### Adapter contract

Every adapter in `apps/scraper/src/adapters/<id>.ts` exports:

```typescript
export interface Adapter {
  id: string;                                      // 'ghsa', 'nvd', ...
  cadence: 'hourly' | '6h' | 'daily';
  fetch(cursor: SourceCursor): Promise<RawItem[]>; // pulls only new since cursor
  normalize(raw: RawItem): Vuln | null;            // null = drop (e.g., not a vuln)
}
```

`RawItem` is `unknown` from adapter's POV; Zod validates inside `normalize`.

The orchestrator (`apps/scraper/src/main.ts`) honors each adapter's `cadence`: on every hourly invocation it queries `sources.json[id].lastFetchedAt` and skips adapters whose cadence interval has not elapsed (`6h` adapters run every 6th hour, `daily` adapters once per day). This keeps low-cadence sources (Tier 3 AI/LLM) from being hammered while still using a single workflow.

## 6. Data Model

All schemas live in `packages/shared/src/schemas.ts`, used by scraper and dashboard.

```typescript
export const Severity = z.enum(['critical', 'high', 'medium', 'low', 'unknown']);

export const Ecosystem = z.enum([
  'npm', 'composer', 'pypi', 'generic', 'ai-llm', 'infrastructure',
]);

export const SourceRef = z.object({
  source: z.string(),
  externalId: z.string(),
  url: z.string().url(),
  fetchedAt: z.string().datetime(),
});

export const Vuln = z.object({
  id: z.string(),                          // canonical: CVE > GHSA > sha1(title+date)
  cveId: z.string().optional(),
  ghsaId: z.string().optional(),
  aliases: z.array(z.string()),

  title: z.string(),
  summary: z.string(),
  details: z.string().max(4000).optional(),

  severity: Severity,
  cvss: z.number().min(0).max(10).optional(),
  cvssVector: z.string().optional(),
  epss: z.number().min(0).max(1).optional(),
  kev: z.boolean().default(false),
  ecosystems: z.array(Ecosystem),
  cwe: z.array(z.string()),

  affected: z.array(z.object({
    ecosystem: Ecosystem,
    package: z.string(),
    versions: z.string(),                  // semver range or "all"
    fixedIn: z.string().optional(),
  })),

  stackMatch: z.object({
    score: z.number().min(0).max(100),
    packages: z.array(z.string()),
    reason: z.enum(['direct-dep', 'transitive', 'framework', 'topic-mention']),
  }),

  priority: z.number().min(0).max(100),

  publishedAt: z.string().datetime(),
  modifiedAt: z.string().datetime(),
  mergedAt: z.string().datetime(),

  sources: z.array(SourceRef).min(1),

  tags: z.array(z.enum([
    'frontend', 'backend', 'ai-llm', 'exploited',
    'zero-day', 'supply-chain', 'symfony', 'nextjs',
  ])),
});

export type Vuln = z.infer<typeof Vuln>;
```

## 7. Deduplication

Three-tier matching, in order of precedence:

1. **CVE ID match.** If both records have `cveId` and they match → same vuln.
2. **GHSA / OSV alias graph.** If incoming `ghsaId` (or any item in `aliases[]`) appears in an existing record's alias set → match. OSV.dev provides the alias mapping in its API responses; we maintain a transitive closure in memory during a run.
3. **Trigram title similarity.** If `trigramSimilarity(a.title, b.title) > 0.85` AND `|a.publishedAt - b.publishedAt| ≤ 7d` AND at least one shared ecosystem → match. Uses `string-similarity` or `fast-trigram` library.

When a match is found, `mergeRecords(existing, incoming)`:

- Unions `sources[]` (no duplicates by `source+externalId`).
- Takes `max(cvss)`, `max(severity)` (where severity-rank ordering applies).
- Prefers non-null fields from either side; if both non-null and differ, prefers most recent `modifiedAt`.
- Unions `aliases[]`, `ecosystems[]`, `cwe[]`, `tags[]`, `affected[]` (deduped by `ecosystem+package`).
- Re-runs `score()` with merged data.
- `mergedAt = now`, `modifiedAt = max(both)`.

Storage of dedupe index: rebuilt in memory from `vulns.json` on every run; not persisted separately. At rolling-window scale (~10k records) this is sub-second.

## 8. Prioritization Scoring

```typescript
priority = clamp(0, 100,
    severityBase            // 0..40   (critical=40, high=30, med=15, low=5, unknown=10)
  + stackMatch.score * 0.35 // 0..35   (direct-dep + version-satisfies = 35)
  + exploitSignal           // 0..15   (KEV=15, EPSS>0.5=10, EPSS>0.1=5, else 0)
  + freshnessBonus          // 0..10   (<7d=10, <30d=5, <90d=2, older=0)
);
```

Post-adjustments:

- `if (kev) priority = max(priority, 85)` — KEV floor: always near-top.
- `if (stackMatch.score === 0 && !tags.includes('ai-llm')) priority *= 0.4` — demote irrelevant.
- `if (tags.includes('ai-llm')) priority = max(priority, stackMatch.score)` — guarantee AI tab tier.

### Severity normalization

| Source field | → severity |
|---|---|
| CVSS 9.0–10.0 | critical |
| CVSS 7.0–8.9 | high |
| CVSS 4.0–6.9 | medium |
| CVSS 0.1–3.9 | low |
| missing CVSS, GHSA `severity` = "CRITICAL" | critical |
| missing both | unknown |

### Push-alert threshold

Fire Teams alert when `priority ≥ 80 AND stackMatch.score ≥ 60 AND vuln not previously alerted`.

Re-alert exception: vuln transitions from `kev: false` → `kev: true` (CISA marks as known-exploited after publish). Fire a single follow-up alert prefixed `[KEV]`.

### Tunable config

`packages/shared/src/scoring-config.ts` exposes:

```typescript
export const SCORING_CONFIG = {
  weights: { severity: 40, stackMatch: 35, exploit: 15, freshness: 10 },
  thresholds: { push: { priority: 80, stackMatch: 60 } },
  decay: { halfLifeDays: 30 },
  floors: { kev: 85 },
};
```

## 9. Stack Inventory (`data/stack.json`)

User-maintained, checked into git. Drives `stackMatch` scoring and push-alert filtering.

```json
{
  "frontend": {
    "next": "14.2.35",
    "react": "18.3.1",
    "@apollo/client": "3.12.5",
    "antd": "4.24.16",
    "axios": "1.7.9",
    "lodash": "4.17.21"
  },
  "backend": {
    "symfony/symfony": "^6",
    "doctrine/orm": "^2.x",
    "twig/twig": "^3"
  },
  "tools": {
    "claude": "*",
    "anthropic-sdk": "*"
  }
}
```

- Keys: ecosystem-native package names (npm style for frontend, Packagist for backend).
- Values: installed version string, or `"*"` for tools without semver.
- Category buckets (`frontend`/`backend`/`tools`) are UI grouping only; scoring ignores them.

Matching logic:

```typescript
function scoreStackMatch(vuln: Vuln, stack: Stack): StackMatch {
  for (const aff of vuln.affected) {
    const installed = stack.lookup(aff.package);
    if (!installed) continue;
    if (installed === '*' || semver.satisfies(installed, aff.versions)) {
      return { score: 100, packages: [aff.package], reason: 'direct-dep' };
    }
    return { score: 60, packages: [aff.package], reason: 'direct-dep' }; // installed but not in vulnerable range
  }
  const mentions = stack.allPackages().filter(p =>
    vuln.title.toLowerCase().includes(p.toLowerCase()) ||
    vuln.summary.toLowerCase().includes(p.toLowerCase())
  );
  if (mentions.length) return { score: 40, packages: mentions, reason: 'topic-mention' };
  return { score: 0, packages: [], reason: 'topic-mention' };
}
```

## 10. Persistence

### Files

| File | Purpose | Size (typical) |
|---|---|---|
| `data/vulns.json` | rolling 90-day live records, sorted by priority desc | 5-15 MB |
| `data/archive/YYYY-MM.json.gz` | monthly rollover, gzipped | 1-3 MB each |
| `data/sources.json` | per-source cursor + health state | < 10 KB |
| `data/alerted.json` | notification idempotency state | < 200 KB |
| `data/last-run.json` | latest run stats + errors | 5-20 KB |
| `data/stack.json` | user inventory | < 5 KB |

### Rollover

When persisting, any record with `modifiedAt < now - 90d` is excluded from `vulns.json` and appended to `data/archive/<month-of-modifiedAt>.json.gz`. Archive files immutable once written.

### Commit message convention

`[bot] scrape: +N new, M updated [skip ci]`

Bot author: `scraper-bot <bot@users.noreply.github.com>`. `[skip ci]` so we don't trigger downstream workflows; Vercel ignores commit-message filters but its build cache will short-circuit if `apps/dashboard` paths unchanged.

## 11. Dashboard (Next.js 16 static)

Versions verified during plan phase (`npm view next dist-tags`).

### Routes

| Path | Filter |
|---|---|
| `/` | All vulns, default sort: priority desc, then publishedAt desc |
| `/frontend` | ecosystem ∈ {npm}, tag ∈ {frontend, nextjs} |
| `/backend` | ecosystem ∈ {composer}, tag ∈ {symfony, backend} |
| `/ai-llm` | tag includes `ai-llm` |
| `/archived` | lazy-loads gzipped archive files |
| `/vuln/[id]` | detail view: markdown render, sources list, affected packages, "Why this score?" breakdown |

### Components

- `VulnRow` — priority badge, severity pill, title, packages chips, age, mark-read button.
- `FilterSidebar` — severity multi-check, ecosystem multi-check, source multi-check, "stack-match only" toggle, "hide read" toggle, "show dismissed" toggle.
- `SearchBar` — Fuse.js over title+summary+packages, debounced 150ms.
- `PriorityBadge` — colored 0-100 number (red ≥80, orange 60-80, yellow 40-60, gray <40), tooltip explains breakdown.
- `SeverityPill` — color-coded critical/high/medium/low/unknown.
- `StackMatchChips` — your packages matched + reason (`direct-dep` etc.).
- `LastUpdated` — header shows "Last scrape: 12 min ago" from `data/sources.json`.
- `SourceHealth` — footer dots per source (green/yellow/red) with tooltip.
- `AlertLog` — last 7 days of Teams-fired alerts, collapsible.

### Client state (Zustand, persisted to localStorage)

```typescript
type Store = {
  readIds: Set<string>;
  hiddenIds: Set<string>;
  filters: {
    severities: Severity[];
    ecosystems: Ecosystem[];
    sources: string[];
    stackMatchOnly: boolean;
    hideRead: boolean;
  };
  query: string;
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
  reset: () => void;
};
```

### Build & rendering

- `output: 'export'` (static, no server runtime). Verify still supported in Next 16; fallback Astro if removed.
- Build reads `data/vulns.json` and injects as JSON blob in initial HTML.
- Client hydration: parse → build Fuse.js index → hand to Zustand. ~50ms for 10k rows.
- Archive tab uses dynamic `import('/data/archive/*.json.gz')` on click only.

### Styling

- Tailwind v4, CSS-first config via `@theme` in `app/globals.css`.
- Radix UI primitives for popovers, dialogs, checkboxes.
- Dark mode default, light toggle via `prefers-color-scheme`.

### Bundle budget

- First-load JS ≤ 150 KB gzipped.
- Total page ≤ 500 KB including data blob (at 10k records).
- No external images beyond favicons + severity SVG icons.

## 12. GitHub Actions Workflow

### `.github/workflows/scrape.yml`

```yaml
name: hourly-scrape
on:
  schedule:
    - cron: '7 * * * *'
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: scrape
  cancel-in-progress: false

jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 12
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.SCRAPER_PAT }}
          fetch-depth: 1

      - uses: pnpm/action-setup@v4
        with: { version: 9 }

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: scrape
        env:
          GITHUB_TOKEN:      ${{ secrets.GITHUB_TOKEN }}
          NVD_API_KEY:       ${{ secrets.NVD_API_KEY }}
          TEAMS_WEBHOOK_URL: ${{ secrets.TEAMS_WEBHOOK_URL }}
          RESEND_API_KEY:    ${{ secrets.RESEND_API_KEY }}
        run: pnpm --filter scraper start

      - name: commit data
        run: |
          git config user.name  "scraper-bot"
          git config user.email "bot@users.noreply.github.com"
          git add data/
          if git diff --cached --quiet; then
            echo "no changes"; exit 0
          fi
          NEW=$(jq '.stats.newCount // 0'     data/last-run.json)
          UPD=$(jq '.stats.updatedCount // 0' data/last-run.json)
          git commit -m "[bot] scrape: +${NEW} new, ${UPD} updated [skip ci]"
          git push

      - name: upload run log on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: scraper-log
          path: data/last-run.json
          retention-days: 7
```

### Required secrets

| Secret | Purpose |
|---|---|
| `SCRAPER_PAT` | Fine-grained PAT, `contents:write` scope, bypasses any branch protection |
| `NVD_API_KEY` | Boosts NVD rate limit (50 req/30s with key, 5 without) |
| `TEAMS_WEBHOOK_URL` | Power Automate workflow webhook URL |
| `RESEND_API_KEY` | Optional, for email channel |
| `GITHUB_TOKEN` | Auto-provided, used for GHSA API |

### Repo visibility

Make the repo **public** to dodge the 2000-min/month Actions quota. The data is non-sensitive (all aggregated from public sources). If repo must stay private, plan for ~1500-2900 min/month usage.

### Scheduler caveats

- GH cron is best-effort; runners may delay 5–15 min under load.
- Adapter `fetch(cursor)` uses `since = max(lastFetchedAt - 30min, now - 2h)` overlap window to guarantee no items slip through gaps.

## 13. Notifications

### Channels

| Adapter | Destination | Activation |
|---|---|---|
| `teams.ts` | MS Teams Adaptive Card via Power Automate workflow webhook | `TEAMS_WEBHOOK_URL` env present |
| `email.ts` | Resend HTML email | `RESEND_API_KEY` env present |
| `webhook.ts` | Generic POST | `GENERIC_WEBHOOK` env present |
| `console.ts` | stdout (dev only, w/ `--dry-run`) | always |

Channels run in parallel via `Promise.allSettled`. Each implements:

```typescript
interface Notifier {
  id: string;
  send(vuln: Vuln): Promise<{ ok: boolean; error?: string }>;
}
```

### Teams Adaptive Card

Card layout:

- Header: severity uppercase + CVE/GHSA id, colored by severity (`Attention` red, `Warning` amber, `Accent` blue, `Good` green).
- Title: vuln title.
- FactSet: Priority, CVSS, EPSS, KEV, Affected packages from your stack, Published (relative).
- Body: summary (subtle text).
- Actions: up to 3 `OpenUrl` buttons to source records.

Implemented per the `buildCard` reference in Section 7 of the brainstorm. POST to webhook; accept HTTP 200 or 202 as success.

### Teams setup (documented in README)

1. Power Automate → Create from blank → trigger "When a Teams webhook request is received".
2. Add action "Post adaptive card in a chat or channel" bound to target channel.
3. Save; copy generated POST URL.
4. Add to GitHub secrets as `TEAMS_WEBHOOK_URL`.
5. Verify with `pnpm scrape --dry-run` (prints what would be sent) then `--alert-test` flag (sends a fake critical to verify webhook).

### Idempotency — `data/alerted.json`

```json
{
  "GHSA-xxxx-yyyy-zzzz": {
    "alertedAt": "2026-05-22T13:07:42Z",
    "channels": { "teams": "ok", "email": "ok" },
    "vulnSnapshot": { "priority": 92, "kev": false, "severity": "critical" }
  }
}
```

Algorithm:

1. Compute `toAlert = vulns.filter(shouldAlert)`.
2. For each, write `alerted.json` entry as `pending` BEFORE any network call.
3. Run all channels in parallel; update entry with per-channel result.
4. Commit `alerted.json` in the same git commit as `vulns.json` — atomic state.
5. Next run, any `pending` channel result = retry (network was transient).

### Rate limiting

- Teams workflow webhook: docs allow burst, but throttle to 1 req/sec to be safe.
- Resend: 10 req/sec.
- If runtime budget exhausted, persist `pending` and resume next run.

## 14. Error Handling & Observability

### Error taxonomy

| Layer | Failure | Handling |
|---|---|---|
| Adapter fetch | network / timeout / 5xx | Retry 3× exponential backoff (1s, 3s, 9s). Then mark source unhealthy, continue run. |
| Adapter parse | malformed response | Log w/ payload (trimmed 2KB) → `last-run.json.errors`. Skip item. |
| Pipeline normalize | required Zod field missing | Drop item, increment `droppedCount`. |
| Dedupe | conflict on cross-source fields | Take max severity, union sources, log conflict. |
| Persist | git push fails | Workflow exits 1; GH emails repo owner; next run picks up state. |
| Notify | channel 4xx / 5xx | Mark channel `pending`; retry next run. |

### Circuit breaker per source

```typescript
type SourceHealth = {
  consecutiveFailures: number;
  lastSuccess: string;
  lastError?: string;
  state: 'closed' | 'open' | 'half-open';
  reopenAt?: string;
};
```

Three consecutive fails → `open` 24h → next run flips to `half-open` (1 trial). Success closes; fail re-opens for another 24h. UI footer shows red dot for open sources with last error tooltip.

### `data/last-run.json` (overwritten each run)

```json
{
  "startedAt":  "2026-05-22T13:07:00Z",
  "finishedAt": "2026-05-22T13:09:42Z",
  "durationMs": 162000,
  "stats": { "newCount": 7, "updatedCount": 23, "droppedCount": 2, "alertCount": 1 },
  "sources": {
    "ghsa":      { "ok": true,  "fetched": 142, "durationMs": 4100 },
    "nvd":       { "ok": true,  "fetched": 380, "durationMs": 28000 },
    "anthropic": { "ok": false, "error": "HTTP 503", "attempts": 3, "durationMs": 13100 }
  },
  "errors": [
    { "source": "anthropic", "phase": "fetch", "message": "503 Service Unavailable" }
  ]
}
```

## 15. Testing Strategy

| Layer | Tool | Target |
|---|---|---|
| Pure pipeline (`dedupe`, `score`, `merge`, `normalize`) | Vitest + fast-check property tests | 95% line, 100% branch on score thresholds |
| Adapters | Vitest fixture snapshot tests (`__fixtures__/<source>/*.json`+`*.html`) | 3+ tests/adapter (happy / empty / malformed) |
| Notify formatting | Vitest snapshot of Teams card JSON | 1 test/severity tier |
| End-to-end pipeline | Vitest + `msw` mocks; asserts `vulns.json` delta | 1 happy + 1 partial-failure scenario |
| Dashboard components | Vitest + React Testing Library | 80% component coverage |
| Dashboard smoke | Playwright | 1 spec: load, filter, search, mark-read |
| Type safety | TS strict, Zod parses all external data | compile-time + runtime |

### Fixture management

- Recorded once from real source, sensitive headers redacted, committed.
- `pnpm fixtures:refresh <source>` updates from live source; run quarterly.

### Lint / format / pre-commit

- ESLint flat config + `@typescript-eslint` (`no-floating-promises` on).
- Prettier.
- Husky pre-commit: `pnpm lint && pnpm typecheck && pnpm test:fast`.
- CI runs the full suite on every PR.

### Local dev commands

```
pnpm dev              # dashboard on localhost:3000 reading data/vulns.json
pnpm scrape           # runs scraper locally, writes to data/
pnpm scrape --dry-run # no commit, no notify, prints stats
pnpm scrape --source=ghsa  # single adapter, debug
pnpm scrape --alert-test   # sends fake critical through configured notifiers
pnpm test             # full suite
pnpm test:watch       # watch mode
```

## 16. Open Questions / Future Work

- **Stack auto-sync** — bootstrap script reading external `package.json` + `composer.json` paths. Out of scope for v1; manual edit of `stack.json` for now.
- **Snooze / mute** — per-package or per-source mute list (e.g., mute `lodash` 30 days when upgrade not possible). Add when noise demands.
- **Cross-device read state** — GitHub OAuth + gist persistence. Not needed for single-user v1.
- **Custom user sources** — `data/sources-extra.json` for opt-in additions. Easy to add post-launch.
- **Webhook to Linear / Jira** — auto-create ticket on critical+stack-match. Future.
- **Diff view** — when a vuln record updates (e.g., CVSS revised), show diff between commits in detail view. Nice-to-have.

## 17. Acceptance Criteria

A v1 release is considered done when:

1. `pnpm scrape --dry-run` runs end-to-end locally with all Tier 1 + Tier 2 adapters wired, against real network, completing in < 5 min.
2. `data/vulns.json` contains ≥ 500 deduped records covering at least 30 days of history.
3. Dashboard builds via `next build` (with `output: 'export'`), deploys to Vercel, loads under 2s on cold cache.
4. Filtering, search, mark-as-read all function in a Playwright spec.
5. A test `--alert-test` invocation posts an adaptive card to the configured Teams channel.
6. GH Actions hourly workflow has run successfully ≥ 24 consecutive hours without manual intervention.
7. At least one real critical alert has been pushed end-to-end to Teams and acknowledged by the user.

## 18. Glossary

- **CVE** — Common Vulnerabilities and Exposures, the universal ID for known vulnerabilities (`CVE-2026-12345`).
- **CVSS** — Common Vulnerability Scoring System, 0–10 severity score.
- **EPSS** — Exploit Prediction Scoring System, 0–1 probability of exploitation in next 30 days.
- **GHSA** — GitHub Security Advisory ID (`GHSA-xxxx-yyyy-zzzz`), often issued before a CVE.
- **KEV** — CISA Known Exploited Vulnerabilities catalog; flag indicating active in-the-wild exploitation.
- **OSV** — Open Source Vulnerabilities, Google-maintained schema + database with cross-ecosystem alias graph.
- **AVID** — AI Vulnerability Database, taxonomy of AI/ML risks.
- **ATLAS** — MITRE's adversarial-ML threat framework.
- **GHSA alias graph** — bidirectional mapping between GHSA IDs, CVE IDs, OSV IDs that OSV.dev maintains; lets us dedupe across naming schemes.
