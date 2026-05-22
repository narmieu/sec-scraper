# Security Vulnerability Scraper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted security vulnerability tracker (scraper + Next.js 16 dashboard) that pulls broad sources, dedupes, ranks by stack-relevance, deploys to Vercel via GitHub Actions hourly cron, and pushes critical alerts to MS Teams.

**Architecture:** pnpm monorepo. `apps/scraper` = Node 22 CLI run by GH Actions. `apps/dashboard` = Next.js 16 static export on Vercel. `packages/shared` = Zod schemas + types both sides import. `data/*.json` committed to repo = canonical state.

**Tech Stack:** TypeScript 5.6+, Node 22, pnpm 9, Next.js 16, React 19, Tailwind v4, Zod, Vitest, Playwright, fast-check, msw, Fuse.js, Zustand, Radix UI, undici, rss-parser, cheerio, semver, string-similarity.

**Spec:** `docs/superpowers/specs/2026-05-22-security-scraper-design.md`

---

## Phase Overview

| Phase | Tasks | Output |
|---|---|---|
| 1. Repo foundation | T1–T3 | pnpm workspace + tooling + CI lint/typecheck |
| 2. Shared package | T4–T6 | Zod schemas, scoring config, stack matcher |
| 3. Pipeline core | T7–T12 | normalize, dedupe, score, persist, fetch util, circuit breaker |
| 4. Tier 1 adapters (APIs) | T13–T18 | GHSA, OSV, NVD, Packagist, EPSS, CISA KEV |
| 5. Tier 2 adapters (RSS) | T19–T26 | RSS util + 7 feed adapters |
| 6. Tier 3 adapters (AI/LLM) | T27–T33 | AVID, OWASP LLM, ATLAS, Anthropic, OpenAI, HackerOne, arxiv |
| 7. Orchestrator + CLI | T34–T36 | main.ts, cli.ts, last-run reporter |
| 8. Notifications | T37–T41 | Teams, email, webhook, console + idempotent dispatch |
| 9. Dashboard | T42–T54 | Next.js 16 app w/ all components and routes |
| 10. CI/CD + bootstrap | T55–T58 | GH Actions, Vercel, README, first-scrape smoke |

---

## File Structure Recap

Created paths (see spec §4 for full tree):

```
apps/scraper/src/
  adapters/{ghsa,osv,nvd,packagist,epss,cisa-kev,
            snyk-rss,sonatype-rss,hackernews,thehackernews,
            bleepingcomputer,symfony-blog,nextjs-releases,
            avid,owasp-llm,mitre-atlas,anthropic-trust,
            openai-security,hackerone-ai,arxiv-cs-cr}.ts
  adapters/__fixtures__/<source>/*.{json,html,xml}
  pipeline/{fetch,normalize,dedupe,score,persist,circuit-breaker}.ts
  notify/{teams,email,webhook,console,dispatch}.ts
  stack.ts main.ts cli.ts
apps/dashboard/
  app/{layout,page,frontend/page,backend/page,ai-llm/page,
       archived/page,vuln/[id]/page}.tsx
  components/{VulnRow,FilterSidebar,SearchBar,PriorityBadge,
              SeverityPill,StackMatchChips,LastUpdated,
              SourceHealth,AlertLog}.tsx
  lib/{store,search,data,build-time-data}.ts
  app/globals.css next.config.mjs
packages/shared/src/
  {schemas,types,scoring-config,constants,stack-matcher}.ts
data/{vulns.json,sources.json,alerted.json,last-run.json,stack.json}
data/archive/
.github/workflows/scrape.yml
scripts/{refresh-fixtures,gen-stack-from-package-json}.ts
```

---

## Phase 1 — Repository Foundation

### Task 1: pnpm workspace + root tooling

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `LICENSE`
- Create: `README.md`

- [ ] **Step 1: Initialize pnpm workspace config**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 2: Root `package.json`**

```json
{
  "name": "security-scraper",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev":        "pnpm --filter dashboard dev",
    "build":      "pnpm -r build",
    "scrape":     "pnpm --filter scraper start",
    "test":       "pnpm -r test",
    "test:fast":  "pnpm -r test:fast",
    "test:watch": "pnpm -r test:watch",
    "lint":       "eslint .",
    "lint:fix":   "eslint . --fix",
    "format":     "prettier --write .",
    "typecheck":  "pnpm -r typecheck",
    "prepare":    "husky"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "eslint": "^9.10.0",
    "@typescript-eslint/eslint-plugin": "^8.4.0",
    "@typescript-eslint/parser": "^8.4.0",
    "prettier": "^3.3.3",
    "husky": "^9.1.5",
    "typescript": "^5.6.2",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 3: Base TS config**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 4: `.gitignore`**

```
node_modules/
dist/
.next/
out/
coverage/
*.log
.env
.env.local
.DS_Store
.turbo/
.vercel/
```

- [ ] **Step 5: `.editorconfig`**

```
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 6: `.nvmrc`**

```
22
```

- [ ] **Step 7: LICENSE (MIT)**

```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 8: Stub README**

```markdown
# security-scraper

Security vulnerability tracker — scrapes broad sources, dedupes, ranks by
stack-relevance, deploys to Vercel via hourly GitHub Actions, pushes critical
alerts to MS Teams.

See `docs/superpowers/specs/2026-05-22-security-scraper-design.md` for the
full design.

## Setup

```bash
pnpm install
pnpm test
pnpm dev          # dashboard
pnpm scrape       # run scraper locally
```

Full setup, secrets, and Teams webhook docs added in Phase 10.
```

- [ ] **Step 9: Install root deps + verify workspace**

Run:
```bash
pnpm install
```
Expected: `Dependencies installed. Project ready.`

```bash
pnpm -v && node -v && pnpm ls -r
```
Expected: pnpm 9.x, node v22.x, no packages yet (only root).

- [ ] **Step 10: Commit**

(Skip — repo not git-initialized per user direction. Commit step omitted for all tasks in this plan; reinstate if user later runs `git init`.)

---

### Task 2: ESLint + Prettier + Vitest + Husky

**Files:**
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `vitest.config.ts`
- Create: `.husky/pre-commit`

- [ ] **Step 1: ESLint flat config**

`eslint.config.mjs`:

```js
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: false,
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs['recommended'].rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    ignores: ['**/dist/**', '**/.next/**', '**/out/**', '**/coverage/**', '**/__fixtures__/**'],
  },
];
```

- [ ] **Step 2: Prettier**

`.prettierrc.json`:

```json
{
  "printWidth": 100,
  "singleQuote": true,
  "trailingComma": "all",
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

`.prettierignore`:

```
node_modules/
dist/
.next/
out/
coverage/
data/
*.gz
```

- [ ] **Step 3: Root Vitest config**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['apps/**/src/**', 'packages/**/src/**'],
      exclude: ['**/__fixtures__/**', '**/*.config.*'],
    },
  },
});
```

- [ ] **Step 4: Husky pre-commit**

Run:
```bash
pnpm exec husky init
```

Edit `.husky/pre-commit`:

```bash
pnpm lint && pnpm typecheck && pnpm test:fast
```

- [ ] **Step 5: Smoke-test lint + typecheck**

Run:
```bash
pnpm lint
```
Expected: no files matched (no .ts yet) — exit 0.

```bash
pnpm typecheck
```
Expected: nothing to typecheck — exit 0.

---

### Task 3: GitHub Actions CI (lint + typecheck + test on PR)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Workflow file**

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
```

- [ ] **Step 2: Verify YAML parses**

Run:
```bash
node -e "import('js-yaml').then(y => console.log(y.load(require('fs').readFileSync('.github/workflows/ci.yml','utf8')) ? 'ok' : 'fail'))"
```
(If `js-yaml` not installed, this step is optional — workflow validates on push.)

---

## Phase 2 — Shared Package (`packages/shared`)

### Task 4: Shared package scaffold + constants

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: `packages/shared/package.json`**

```json
{
  "name": "@sec/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./src/index.ts", "import": "./src/index.ts" }
  },
  "scripts": {
    "build":     "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test":      "vitest run",
    "test:fast": "vitest run --reporter=dot",
    "test:watch":"vitest"
  },
  "dependencies": {
    "zod": "^3.23.8",
    "semver": "^7.6.3"
  },
  "devDependencies": {
    "@types/semver": "^7.5.8",
    "fast-check": "^3.22.0"
  }
}
```

- [ ] **Step 2: `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: `packages/shared/src/constants.ts`**

```ts
export const SOURCE_IDS = [
  'ghsa', 'osv', 'nvd', 'packagist', 'epss', 'cisa-kev',
  'snyk-rss', 'sonatype-rss', 'hackernews', 'thehackernews',
  'bleepingcomputer', 'symfony-blog', 'nextjs-releases',
  'avid', 'owasp-llm', 'mitre-atlas', 'anthropic-trust',
  'openai-security', 'hackerone-ai', 'arxiv-cs-cr',
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

export const ECOSYSTEMS = [
  'npm', 'composer', 'pypi', 'generic', 'ai-llm', 'infrastructure',
] as const;

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'unknown'] as const;

export const TAGS = [
  'frontend', 'backend', 'ai-llm', 'exploited',
  'zero-day', 'supply-chain', 'symfony', 'nextjs',
] as const;

export const ROLLING_WINDOW_DAYS = 90;
```

- [ ] **Step 4: `packages/shared/src/index.ts`**

```ts
export * from './constants.js';
export * from './schemas.js';
export * from './scoring-config.js';
export * from './stack-matcher.js';
export * from './types.js';
```

- [ ] **Step 5: Install + verify typecheck**

Run:
```bash
pnpm install
pnpm --filter @sec/shared typecheck
```
Expected: `error TS2307: Cannot find module './schemas.js'` (we haven't written it yet — fixed in next task).

---

### Task 5: Zod schemas + inferred types

**Files:**
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/types.ts`
- Test: `packages/shared/src/schemas.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Vuln } from './schemas.js';

describe('Vuln schema', () => {
  it('accepts a minimal valid record', () => {
    const v = {
      id: 'CVE-2026-1',
      aliases: [],
      title: 't',
      summary: 's',
      severity: 'high',
      ecosystems: ['npm'],
      cwe: [],
      affected: [],
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 50,
      publishedAt: '2026-05-22T00:00:00Z',
      modifiedAt: '2026-05-22T00:00:00Z',
      mergedAt: '2026-05-22T00:00:00Z',
      sources: [{ source: 'ghsa', externalId: 'GHSA-x', url: 'https://x.example', fetchedAt: '2026-05-22T00:00:00Z' }],
      tags: [],
    };
    expect(() => Vuln.parse(v)).not.toThrow();
  });

  it('rejects priority above 100', () => {
    expect(() => Vuln.parse({ ...minimal(), priority: 101 })).toThrow();
  });

  it('rejects cvss above 10', () => {
    expect(() => Vuln.parse({ ...minimal(), cvss: 12 })).toThrow();
  });

  it('rejects unknown severity', () => {
    expect(() => Vuln.parse({ ...minimal(), severity: 'XXL' })).toThrow();
  });

  it('rejects empty sources', () => {
    expect(() => Vuln.parse({ ...minimal(), sources: [] })).toThrow();
  });
});

function minimal() {
  return {
    id: 'X-1', aliases: [], title: 't', summary: 's', severity: 'low',
    ecosystems: ['npm'], cwe: [], affected: [],
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0,
    publishedAt: '2026-05-22T00:00:00Z',
    modifiedAt: '2026-05-22T00:00:00Z',
    mergedAt:   '2026-05-22T00:00:00Z',
    sources: [{ source: 'ghsa', externalId: 'x', url: 'https://x.example', fetchedAt: '2026-05-22T00:00:00Z' }],
    tags: [],
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @sec/shared test
```
Expected: FAIL — `Cannot find module './schemas.js'`.

- [ ] **Step 3: Write schemas**

`packages/shared/src/schemas.ts`:

```ts
import { z } from 'zod';
import { ECOSYSTEMS, SEVERITIES, TAGS } from './constants.js';

export const Severity  = z.enum(SEVERITIES);
export const Ecosystem = z.enum(ECOSYSTEMS);
export const Tag       = z.enum(TAGS);

export const SourceRef = z.object({
  source:     z.string(),
  externalId: z.string(),
  url:        z.string().url(),
  fetchedAt:  z.string().datetime(),
});

export const StackMatchReason = z.enum(['direct-dep', 'transitive', 'framework', 'topic-mention']);

export const StackMatch = z.object({
  score:    z.number().min(0).max(100),
  packages: z.array(z.string()),
  reason:   StackMatchReason,
});

export const Affected = z.object({
  ecosystem: Ecosystem,
  package:   z.string(),
  versions:  z.string(),
  fixedIn:   z.string().optional(),
});

export const Vuln = z.object({
  id:      z.string(),
  cveId:   z.string().optional(),
  ghsaId:  z.string().optional(),
  aliases: z.array(z.string()),

  title:   z.string(),
  summary: z.string(),
  details: z.string().max(4000).optional(),

  severity:   Severity,
  cvss:       z.number().min(0).max(10).optional(),
  cvssVector: z.string().optional(),
  epss:       z.number().min(0).max(1).optional(),
  kev:        z.boolean().default(false),
  ecosystems: z.array(Ecosystem),
  cwe:        z.array(z.string()),

  affected:   z.array(Affected),

  stackMatch: StackMatch,
  priority:   z.number().min(0).max(100),

  publishedAt: z.string().datetime(),
  modifiedAt:  z.string().datetime(),
  mergedAt:    z.string().datetime(),

  sources: z.array(SourceRef).min(1),
  tags:    z.array(Tag),
});

export const SourceHealth = z.object({
  consecutiveFailures: z.number().int().nonnegative(),
  lastSuccess:         z.string().datetime().optional(),
  lastError:           z.string().optional(),
  state:               z.enum(['closed', 'open', 'half-open']),
  reopenAt:            z.string().datetime().optional(),
  lastFetchedAt:       z.string().datetime().optional(),
  lastCursor:          z.string().optional(),
});

export const SourcesFile = z.record(z.string(), SourceHealth);

export const AlertEntry = z.object({
  alertedAt:    z.string().datetime(),
  kevAlertedAt: z.string().datetime().optional(),
  channels:     z.record(z.string(), z.string()),  // channel-id → 'ok' | 'pending' | 'fail:reason'
  vulnSnapshot: z.object({
    priority: z.number(),
    kev:      z.boolean(),
    severity: Severity,
  }),
});

export const AlertedFile = z.record(z.string(), AlertEntry);

export const LastRun = z.object({
  startedAt:  z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  stats: z.object({
    newCount:     z.number().int().nonnegative(),
    updatedCount: z.number().int().nonnegative(),
    droppedCount: z.number().int().nonnegative(),
    alertCount:   z.number().int().nonnegative(),
  }),
  sources: z.record(z.string(), z.object({
    ok:         z.boolean(),
    fetched:    z.number().int().nonnegative().optional(),
    error:      z.string().optional(),
    attempts:   z.number().int().positive().optional(),
    durationMs: z.number().int().nonnegative(),
  })),
  errors: z.array(z.object({
    source:  z.string(),
    phase:   z.enum(['fetch', 'parse', 'normalize', 'persist', 'notify']),
    message: z.string(),
    stack:   z.string().optional(),
  })),
});

export const Stack = z.object({
  frontend: z.record(z.string(), z.string()),
  backend:  z.record(z.string(), z.string()),
  tools:    z.record(z.string(), z.string()),
});
```

- [ ] **Step 4: Inferred types**

`packages/shared/src/types.ts`:

```ts
import type { z } from 'zod';
import type {
  Vuln, SourceRef, StackMatch, Affected, Ecosystem, Severity, Tag,
  SourceHealth, SourcesFile, AlertEntry, AlertedFile, LastRun, Stack,
} from './schemas.js';

export type Vuln         = z.infer<typeof Vuln>;
export type SourceRef    = z.infer<typeof SourceRef>;
export type StackMatch   = z.infer<typeof StackMatch>;
export type Affected    = z.infer<typeof Affected>;
export type Ecosystem    = z.infer<typeof Ecosystem>;
export type Severity     = z.infer<typeof Severity>;
export type Tag          = z.infer<typeof Tag>;
export type SourceHealth = z.infer<typeof SourceHealth>;
export type SourcesFile  = z.infer<typeof SourcesFile>;
export type AlertEntry   = z.infer<typeof AlertEntry>;
export type AlertedFile  = z.infer<typeof AlertedFile>;
export type LastRun      = z.infer<typeof LastRun>;
export type Stack        = z.infer<typeof Stack>;
```

- [ ] **Step 5: Run test to verify it passes**

Run:
```bash
pnpm --filter @sec/shared test
```
Expected: 5/5 passing.

---

### Task 6: Scoring config + stack matcher

**Files:**
- Create: `packages/shared/src/scoring-config.ts`
- Create: `packages/shared/src/stack-matcher.ts`
- Test: `packages/shared/src/stack-matcher.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/shared/src/stack-matcher.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildStackIndex, scoreStackMatch } from './stack-matcher.js';
import type { Stack, Vuln } from './types.js';

const stack: Stack = {
  frontend: { 'next': '14.2.35', 'react': '18.3.1', 'lodash': '4.17.21' },
  backend:  { 'symfony/symfony': '^6.4' },
  tools:    { 'claude': '*' },
};

const idx = buildStackIndex(stack);

function vuln(overrides: Partial<Vuln>): Vuln {
  return {
    id: 'X', aliases: [], title: 't', summary: 's', severity: 'low',
    ecosystems: [], cwe: [], affected: [],
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0,
    publishedAt: '2026-05-22T00:00:00Z',
    modifiedAt:  '2026-05-22T00:00:00Z',
    mergedAt:    '2026-05-22T00:00:00Z',
    sources: [{ source:'s', externalId:'x', url:'https://x.example', fetchedAt:'2026-05-22T00:00:00Z' }],
    tags: [], kev: false,
    ...overrides,
  };
}

describe('stack-matcher', () => {
  it('returns 100 + direct-dep when installed version satisfies vulnerable range', () => {
    const v = vuln({ affected: [{ ecosystem: 'npm', package: 'next', versions: '<14.2.36' }] });
    expect(scoreStackMatch(v, idx)).toEqual({ score: 100, packages: ['next'], reason: 'direct-dep' });
  });

  it('returns 60 when installed version does NOT satisfy vulnerable range', () => {
    const v = vuln({ affected: [{ ecosystem: 'npm', package: 'next', versions: '<14.0.0' }] });
    expect(scoreStackMatch(v, idx)).toEqual({ score: 60, packages: ['next'], reason: 'direct-dep' });
  });

  it('returns 40 + topic-mention when title mentions stack package but no affected match', () => {
    const v = vuln({ title: 'Severe Next.js bug discovered' });
    const r = scoreStackMatch(v, idx);
    expect(r.score).toBe(40);
    expect(r.reason).toBe('topic-mention');
    expect(r.packages).toContain('next');
  });

  it('returns 100 for wildcard tool match', () => {
    const v = vuln({ affected: [{ ecosystem: 'ai-llm', package: 'claude', versions: 'any' }] });
    expect(scoreStackMatch(v, idx).score).toBe(100);
  });

  it('returns 0 when nothing matches', () => {
    const v = vuln({ affected: [{ ecosystem: 'pypi', package: 'flask', versions: '<3.0.0' }] });
    expect(scoreStackMatch(v, idx)).toEqual({ score: 0, packages: [], reason: 'topic-mention' });
  });

  it('matches composer-style names case-insensitively in mentions', () => {
    const v = vuln({ summary: 'A critical issue affects Symfony/Symfony framework users.' });
    const r = scoreStackMatch(v, idx);
    expect(r.score).toBe(40);
    expect(r.packages).toContain('symfony/symfony');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @sec/shared test
```
Expected: FAIL — `Cannot find module './stack-matcher.js'`.

- [ ] **Step 3: Scoring config**

`packages/shared/src/scoring-config.ts`:

```ts
export const SCORING_CONFIG = {
  weights: { severity: 40, stackMatch: 35, exploit: 15, freshness: 10 },
  thresholds: { push: { priority: 80, stackMatch: 60 } },
  decay: { halfLifeDays: 30 },
  floors: { kev: 85 },
  demoteWhenIrrelevantFactor: 0.4,
} as const;
```

- [ ] **Step 4: Stack matcher**

`packages/shared/src/stack-matcher.ts`:

```ts
import semver from 'semver';
import type { Stack, StackMatch, Vuln } from './types.js';

export type StackIndex = {
  /** lowercased package name → installed version string */
  byName: Map<string, string>;
  /** all package names lowercased */
  allLower: string[];
  /** original-case lookup */
  originalCase: Map<string, string>;
};

export function buildStackIndex(stack: Stack): StackIndex {
  const byName = new Map<string, string>();
  const originalCase = new Map<string, string>();
  for (const category of [stack.frontend, stack.backend, stack.tools]) {
    for (const [pkg, version] of Object.entries(category)) {
      byName.set(pkg.toLowerCase(), version);
      originalCase.set(pkg.toLowerCase(), pkg);
    }
  }
  return { byName, allLower: [...byName.keys()], originalCase };
}

export function scoreStackMatch(vuln: Vuln, idx: StackIndex): StackMatch {
  // Step 1: direct-dep with version-range check
  for (const aff of vuln.affected) {
    const installed = idx.byName.get(aff.package.toLowerCase());
    if (!installed) continue;
    const original = idx.originalCase.get(aff.package.toLowerCase()) ?? aff.package;
    if (installed === '*' || versionSatisfies(installed, aff.versions)) {
      return { score: 100, packages: [original], reason: 'direct-dep' };
    }
    return { score: 60, packages: [original], reason: 'direct-dep' };
  }

  // Step 2: topic-mention fallback (title/summary)
  const haystack = `${vuln.title}\n${vuln.summary}`.toLowerCase();
  const mentions: string[] = [];
  for (const name of idx.allLower) {
    if (name.length < 3) continue; // skip too-short noisy matches
    if (haystack.includes(name)) {
      mentions.push(idx.originalCase.get(name) ?? name);
    }
  }
  if (mentions.length > 0) {
    return { score: 40, packages: mentions, reason: 'topic-mention' };
  }
  return { score: 0, packages: [], reason: 'topic-mention' };
}

function versionSatisfies(installed: string, range: string): boolean {
  if (range === 'any' || range === '*') return true;
  // Some sources use comma-separated ranges (",", " " or " || ")
  // semver supports || directly; normalize ", " to " || "
  const normalized = range.replace(/,\s*/g, ' || ');
  const cleanInstalled = semver.coerce(installed)?.version ?? installed;
  try {
    return semver.satisfies(cleanInstalled, normalized, { includePrerelease: true });
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run tests**

Run:
```bash
pnpm --filter @sec/shared test
```
Expected: all passing (5 schema + 6 stack-matcher = 11 tests).

---

---

## Phase 3 — Pipeline Core (`apps/scraper`)

### Task 7: Scraper package scaffold

**Files:**
- Create: `apps/scraper/package.json`
- Create: `apps/scraper/tsconfig.json`
- Create: `apps/scraper/vitest.config.ts`
- Create: `apps/scraper/src/index.ts` (stub)

- [ ] **Step 1: `apps/scraper/package.json`**

```json
{
  "name": "@sec/scraper",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start":      "tsx src/cli.ts",
    "build":      "tsc -p tsconfig.json",
    "typecheck":  "tsc -p tsconfig.json --noEmit",
    "test":       "vitest run",
    "test:fast":  "vitest run --reporter=dot",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@sec/shared": "workspace:*",
    "zod": "^3.23.8",
    "undici": "^6.19.8",
    "rss-parser": "^3.13.0",
    "cheerio": "^1.0.0",
    "semver": "^7.6.3",
    "string-similarity-js": "^2.1.4"
  },
  "devDependencies": {
    "tsx": "^4.19.1",
    "msw": "^2.4.4",
    "fast-check": "^3.22.0",
    "@types/semver": "^7.5.8"
  }
}
```

- [ ] **Step 2: `apps/scraper/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: `apps/scraper/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Stub `src/index.ts`**

```ts
export {};
```

- [ ] **Step 5: Install + verify**

Run:
```bash
pnpm install
pnpm --filter @sec/scraper typecheck
```
Expected: typecheck passes (0 errors).

---

### Task 8: HTTP fetch utility with retry + backoff

**Files:**
- Create: `apps/scraper/src/pipeline/fetch.ts`
- Test: `apps/scraper/src/pipeline/fetch.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/scraper/src/pipeline/fetch.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { fetchJson, fetchText } from './fetch.js';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchJson', () => {
  it('returns parsed JSON on 200', async () => {
    server.use(http.get('https://api.test/ok', () => HttpResponse.json({ a: 1 })));
    expect(await fetchJson('https://api.test/ok')).toEqual({ a: 1 });
  });

  it('retries on 503 then succeeds', async () => {
    let n = 0;
    server.use(http.get('https://api.test/retry', () => {
      n++;
      if (n < 3) return new HttpResponse(null, { status: 503 });
      return HttpResponse.json({ ok: true });
    }));
    const r = await fetchJson('https://api.test/retry', { retries: 3, baseDelayMs: 5 });
    expect(r).toEqual({ ok: true });
    expect(n).toBe(3);
  });

  it('throws after exhausting retries', async () => {
    server.use(http.get('https://api.test/fail', () => new HttpResponse(null, { status: 500 })));
    await expect(fetchJson('https://api.test/fail', { retries: 2, baseDelayMs: 1 }))
      .rejects.toThrow(/500/);
  });

  it('does not retry 4xx (client errors)', async () => {
    let n = 0;
    server.use(http.get('https://api.test/404', () => { n++; return new HttpResponse(null, { status: 404 }); }));
    await expect(fetchJson('https://api.test/404', { retries: 3, baseDelayMs: 1 })).rejects.toThrow(/404/);
    expect(n).toBe(1);
  });

  it('sends If-Modified-Since when provided', async () => {
    let header = '';
    server.use(http.get('https://api.test/cond', ({ request }) => {
      header = request.headers.get('if-modified-since') ?? '';
      return HttpResponse.json({});
    }));
    await fetchJson('https://api.test/cond', { ifModifiedSince: 'Wed, 21 Oct 2026 07:28:00 GMT' });
    expect(header).toBe('Wed, 21 Oct 2026 07:28:00 GMT');
  });
});

describe('fetchText', () => {
  it('returns raw body string', async () => {
    server.use(http.get('https://api.test/feed.xml', () => HttpResponse.text('<rss/>')));
    expect(await fetchText('https://api.test/feed.xml')).toBe('<rss/>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @sec/scraper test fetch
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `fetch.ts`**

```ts
import { fetch } from 'undici';

export interface FetchOpts {
  retries?: number;            // default 3
  baseDelayMs?: number;        // default 1000
  timeoutMs?: number;          // default 20000
  headers?: Record<string, string>;
  ifModifiedSince?: string;    // RFC 1123 date
}

export class HttpError extends Error {
  constructor(public status: number, public url: string, public body: string) {
    super(`HTTP ${status} ${url}`);
  }
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const r = await fetchWithRetry(url, opts);
  return await r.text();
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const r = await fetchWithRetry(url, opts);
  return (await r.json()) as T;
}

async function fetchWithRetry(url: string, opts: FetchOpts) {
  const retries = opts.retries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 1000;
  const timeout = opts.timeoutMs ?? 20_000;

  const headers: Record<string, string> = {
    'user-agent': 'security-scraper-bot/0.1 (+https://github.com)',
    'accept': 'application/json, text/xml, text/html, */*',
    ...opts.headers,
  };
  if (opts.ifModifiedSince) headers['if-modified-since'] = opts.ifModifiedSince;

  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(t);
      if (r.ok || r.status === 304) return r;
      if (r.status >= 400 && r.status < 500) {
        const body = await r.text().catch(() => '');
        throw new HttpError(r.status, url, body.slice(0, 200));
      }
      lastErr = new HttpError(r.status, url, '');
    } catch (e: unknown) {
      clearTimeout(t);
      if (e instanceof HttpError && e.status >= 400 && e.status < 500) throw e;
      lastErr = e;
    }
    if (attempt < retries - 1) {
      const delay = baseDelay * Math.pow(3, attempt);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @sec/scraper test fetch
```
Expected: 6/6 passing.

---

### Task 9: Pipeline normalize (raw → Vuln helpers)

**Files:**
- Create: `apps/scraper/src/pipeline/normalize.ts`
- Test: `apps/scraper/src/pipeline/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/scraper/src/pipeline/normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cvssToSeverity, deriveSeverity, normalizeAffected, normalizeVuln, canonicalId } from './normalize.js';

describe('cvssToSeverity', () => {
  it('maps 9.0+ to critical', () => expect(cvssToSeverity(9.0)).toBe('critical'));
  it('maps 7.0-8.9 to high',    () => expect(cvssToSeverity(7.5)).toBe('high'));
  it('maps 4.0-6.9 to medium',  () => expect(cvssToSeverity(5.0)).toBe('medium'));
  it('maps 0.1-3.9 to low',     () => expect(cvssToSeverity(2.5)).toBe('low'));
  it('returns unknown for undefined', () => expect(cvssToSeverity(undefined)).toBe('unknown'));
  it('returns unknown for 0',   () => expect(cvssToSeverity(0)).toBe('unknown'));
});

describe('deriveSeverity', () => {
  it('prefers CVSS when both provided', () => {
    expect(deriveSeverity({ cvss: 9.5, ghsaSeverity: 'LOW' })).toBe('critical');
  });
  it('falls back to GHSA label when CVSS missing', () => {
    expect(deriveSeverity({ ghsaSeverity: 'HIGH' })).toBe('high');
  });
  it('returns unknown when both missing', () => {
    expect(deriveSeverity({})).toBe('unknown');
  });
});

describe('canonicalId', () => {
  it('prefers CVE over GHSA', () => {
    expect(canonicalId({ cveId: 'CVE-2026-1', ghsaId: 'GHSA-x' })).toBe('CVE-2026-1');
  });
  it('uses GHSA when no CVE', () => {
    expect(canonicalId({ ghsaId: 'GHSA-abc' })).toBe('GHSA-abc');
  });
  it('falls back to hash when neither', () => {
    const id = canonicalId({ title: 'x', publishedAt: '2026-05-22T00:00:00Z' });
    expect(id).toMatch(/^h-[0-9a-f]{12}$/);
  });
});

describe('normalizeAffected', () => {
  it('collapses missing fixedIn', () => {
    expect(normalizeAffected({ ecosystem: 'npm', package: 'next', versions: '<14.2.36' })).toEqual({
      ecosystem: 'npm', package: 'next', versions: '<14.2.36',
    });
  });
  it('keeps fixedIn when present', () => {
    expect(normalizeAffected({ ecosystem: 'npm', package: 'react', versions: '<19.0.1', fixedIn: '19.0.1' })).toEqual({
      ecosystem: 'npm', package: 'react', versions: '<19.0.1', fixedIn: '19.0.1',
    });
  });
});

describe('normalizeVuln (Zod validation)', () => {
  it('returns null for invalid input', () => {
    expect(normalizeVuln({ id: 'X' } as any)).toBeNull();
  });
  it('returns parsed Vuln for valid input', () => {
    const result = normalizeVuln({
      id: 'CVE-2026-1', aliases: [], title: 't', summary: 's', severity: 'high',
      ecosystems: ['npm'], cwe: [], affected: [],
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0,
      publishedAt: '2026-05-22T00:00:00Z',
      modifiedAt:  '2026-05-22T00:00:00Z',
      mergedAt:    '2026-05-22T00:00:00Z',
      sources: [{ source:'s', externalId:'x', url:'https://x.example', fetchedAt:'2026-05-22T00:00:00Z' }],
      tags: [],
    });
    expect(result?.id).toBe('CVE-2026-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @sec/scraper test normalize
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `normalize.ts`**

```ts
import { createHash } from 'node:crypto';
import { Vuln, type Affected, type Severity } from '@sec/shared';

export function cvssToSeverity(cvss: number | undefined): Severity {
  if (cvss === undefined || cvss <= 0) return 'unknown';
  if (cvss >= 9.0) return 'critical';
  if (cvss >= 7.0) return 'high';
  if (cvss >= 4.0) return 'medium';
  return 'low';
}

export function deriveSeverity(input: {
  cvss?: number;
  ghsaSeverity?: string;
}): Severity {
  if (input.cvss !== undefined && input.cvss > 0) return cvssToSeverity(input.cvss);
  const g = input.ghsaSeverity?.toLowerCase();
  if (g === 'critical') return 'critical';
  if (g === 'high') return 'high';
  if (g === 'medium' || g === 'moderate') return 'medium';
  if (g === 'low') return 'low';
  return 'unknown';
}

export function canonicalId(input: {
  cveId?: string;
  ghsaId?: string;
  title?: string;
  publishedAt?: string;
}): string {
  if (input.cveId) return input.cveId;
  if (input.ghsaId) return input.ghsaId;
  const seed = `${input.title ?? ''}|${input.publishedAt ?? ''}`;
  const h = createHash('sha1').update(seed).digest('hex').slice(0, 12);
  return `h-${h}`;
}

export function normalizeAffected(input: {
  ecosystem: Affected['ecosystem'];
  package: string;
  versions: string;
  fixedIn?: string;
}): Affected {
  const a: Affected = {
    ecosystem: input.ecosystem,
    package:   input.package,
    versions:  input.versions || 'any',
  };
  if (input.fixedIn) a.fixedIn = input.fixedIn;
  return a;
}

/** Parse arbitrary input through Zod. Returns null on failure (caller logs). */
export function normalizeVuln(input: unknown): import('@sec/shared').Vuln | null {
  const r = Vuln.safeParse(input);
  return r.success ? r.data : null;
}

/** Standardize summary/title whitespace, strip HTML if any leaked through. */
export function cleanText(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 4000);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @sec/scraper test normalize
```
Expected: all passing.

---

### Task 10: Pipeline dedupe (3-tier matcher + merge)

**Files:**
- Create: `apps/scraper/src/pipeline/dedupe.ts`
- Test: `apps/scraper/src/pipeline/dedupe.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/scraper/src/pipeline/dedupe.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dedupeMerge, mergeRecords } from './dedupe.js';
import type { Vuln } from '@sec/shared';

function v(o: Partial<Vuln>): Vuln {
  return {
    id: o.id ?? 'X-1',
    aliases: [],
    title: 't', summary: 's', severity: 'low',
    ecosystems: ['npm'], cwe: [], affected: [],
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0,
    publishedAt: '2026-05-22T00:00:00Z',
    modifiedAt:  '2026-05-22T00:00:00Z',
    mergedAt:    '2026-05-22T00:00:00Z',
    sources: [{ source:'s', externalId:'x', url:'https://x.example', fetchedAt:'2026-05-22T00:00:00Z' }],
    tags: [], kev: false,
    ...o,
  } as Vuln;
}

describe('dedupeMerge', () => {
  it('matches by CVE id', () => {
    const a = v({ id: 'CVE-1', cveId: 'CVE-1', severity: 'low' });
    const b = v({ id: 'GHSA-1', cveId: 'CVE-1', ghsaId: 'GHSA-1', severity: 'critical',
      sources: [{ source:'ghsa', externalId:'GHSA-1', url:'https://g', fetchedAt:'2026-05-22T00:00:00Z' }] });
    const out = dedupeMerge([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('critical');
    expect(out[0]!.sources).toHaveLength(2);
  });

  it('matches by GHSA id', () => {
    const a = v({ id: 'GHSA-x', ghsaId: 'GHSA-x' });
    const b = v({ id: 'GHSA-x-dup', ghsaId: 'GHSA-x',
      sources: [{ source:'osv', externalId:'OSV-1', url:'https://o', fetchedAt:'2026-05-22T00:00:00Z' }] });
    expect(dedupeMerge([a, b])).toHaveLength(1);
  });

  it('matches by shared alias', () => {
    const a = v({ id: 'A-1', cveId: 'CVE-9', aliases: ['GHSA-z'] });
    const b = v({ id: 'B-1', ghsaId: 'GHSA-z', aliases: [] });
    expect(dedupeMerge([a, b])).toHaveLength(1);
  });

  it('matches by trigram similarity + same-week window', () => {
    const a = v({ id: 'A', title: 'Critical XSS in lodash sanitizer', publishedAt: '2026-05-22T00:00:00Z' });
    const b = v({ id: 'B', title: 'Critical XSS in lodash sanitizer (mitigated)', publishedAt: '2026-05-23T00:00:00Z' });
    expect(dedupeMerge([a, b])).toHaveLength(1);
  });

  it('does NOT merge if similar title outside 7-day window', () => {
    const a = v({ id: 'A', title: 'Critical XSS in lodash sanitizer', publishedAt: '2026-01-01T00:00:00Z' });
    const b = v({ id: 'B', title: 'Critical XSS in lodash sanitizer', publishedAt: '2026-05-22T00:00:00Z' });
    expect(dedupeMerge([a, b])).toHaveLength(2);
  });

  it('keeps unrelated vulns separate', () => {
    const a = v({ id: 'A', cveId: 'CVE-1' });
    const b = v({ id: 'B', cveId: 'CVE-2' });
    expect(dedupeMerge([a, b])).toHaveLength(2);
  });
});

describe('mergeRecords', () => {
  it('unions sources without duplicates', () => {
    const a = v({ sources: [{ source: 'ghsa', externalId: 'G-1', url: 'https://a', fetchedAt: '2026-05-22T00:00:00Z' }] });
    const b = v({ sources: [{ source: 'ghsa', externalId: 'G-1', url: 'https://a', fetchedAt: '2026-05-22T00:00:00Z' },
                             { source: 'nvd',  externalId: 'CVE-1', url: 'https://n', fetchedAt: '2026-05-22T00:00:00Z' }] });
    const out = mergeRecords(a, b);
    expect(out.sources).toHaveLength(2);
  });

  it('takes max CVSS', () => {
    const a = v({ cvss: 5.0 });
    const b = v({ cvss: 9.2 });
    expect(mergeRecords(a, b).cvss).toBe(9.2);
  });

  it('takes highest severity', () => {
    const a = v({ severity: 'medium' });
    const b = v({ severity: 'critical' });
    expect(mergeRecords(a, b).severity).toBe('critical');
  });

  it('unions tags and aliases', () => {
    const a = v({ tags: ['nextjs'], aliases: ['GHSA-a'] });
    const b = v({ tags: ['frontend'], aliases: ['CVE-1'] });
    const out = mergeRecords(a, b);
    expect(new Set(out.tags)).toEqual(new Set(['nextjs', 'frontend']));
    expect(new Set(out.aliases)).toEqual(new Set(['GHSA-a', 'CVE-1']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @sec/scraper test dedupe
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dedupe.ts`**

```ts
import { stringSimilarity } from 'string-similarity-js';
import type { Severity, Vuln } from '@sec/shared';

const SEV_RANK: Record<Severity, number> = {
  unknown: 0, low: 1, medium: 2, high: 3, critical: 4,
};

const SIMILARITY_THRESHOLD = 0.85;
const WINDOW_DAYS = 7;

export function dedupeMerge(items: Vuln[]): Vuln[] {
  const out: Vuln[] = [];
  for (const item of items) {
    const matchIdx = findMatchIndex(item, out);
    if (matchIdx >= 0) {
      out[matchIdx] = mergeRecords(out[matchIdx]!, item);
    } else {
      out.push(item);
    }
  }
  return out;
}

function findMatchIndex(item: Vuln, pool: Vuln[]): number {
  for (let i = 0; i < pool.length; i++) {
    if (matches(item, pool[i]!)) return i;
  }
  return -1;
}

function matches(a: Vuln, b: Vuln): boolean {
  // Tier 1: CVE id
  if (a.cveId && b.cveId && a.cveId === b.cveId) return true;
  // Tier 2: GHSA id
  if (a.ghsaId && b.ghsaId && a.ghsaId === b.ghsaId) return true;
  // Alias graph: any shared id between {cveId,ghsaId,aliases}
  const idsA = new Set([a.cveId, a.ghsaId, ...a.aliases].filter(Boolean) as string[]);
  const idsB = new Set([b.cveId, b.ghsaId, ...b.aliases].filter(Boolean) as string[]);
  for (const id of idsA) if (idsB.has(id)) return true;
  // Tier 3: trigram similarity + window
  const dt = Math.abs(new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
  if (dt > WINDOW_DAYS * 24 * 3600 * 1000) return false;
  const sim = stringSimilarity(a.title.toLowerCase(), b.title.toLowerCase());
  if (sim >= SIMILARITY_THRESHOLD) {
    const ecosA = new Set(a.ecosystems);
    for (const e of b.ecosystems) if (ecosA.has(e)) return true;
    if (a.ecosystems.length === 0 && b.ecosystems.length === 0) return true;
  }
  return false;
}

export function mergeRecords(a: Vuln, b: Vuln): Vuln {
  const sources = unionBy([...a.sources, ...b.sources], s => `${s.source}|${s.externalId}`);
  const aliases = unique([...a.aliases, ...b.aliases, a.cveId, a.ghsaId, b.cveId, b.ghsaId].filter(Boolean) as string[]);
  const newer = pickNewer(a, b);

  const merged: Vuln = {
    id: a.cveId ?? b.cveId ?? a.ghsaId ?? b.ghsaId ?? a.id,
    cveId:  a.cveId  ?? b.cveId,
    ghsaId: a.ghsaId ?? b.ghsaId,
    aliases,
    title:   newer.title,
    summary: newer.summary,
    details: a.details ?? b.details,
    severity:   higherSeverity(a.severity, b.severity),
    cvss:       maxOrUndef(a.cvss, b.cvss),
    cvssVector: a.cvssVector ?? b.cvssVector,
    epss:       maxOrUndef(a.epss, b.epss),
    kev:        a.kev || b.kev,
    ecosystems: unique([...a.ecosystems, ...b.ecosystems]),
    cwe:        unique([...a.cwe, ...b.cwe]),
    affected:   unionBy([...a.affected, ...b.affected], x => `${x.ecosystem}|${x.package}`),
    stackMatch: a.stackMatch.score >= b.stackMatch.score ? a.stackMatch : b.stackMatch,
    priority:   Math.max(a.priority, b.priority),
    publishedAt: min(a.publishedAt, b.publishedAt),
    modifiedAt:  max(a.modifiedAt,  b.modifiedAt),
    mergedAt:    new Date().toISOString(),
    sources,
    tags:        unique([...a.tags, ...b.tags]),
  };
  return merged;
}

function unionBy<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) { const k = key(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}
function unique<T>(arr: T[]): T[] { return [...new Set(arr)]; }
function maxOrUndef(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}
function higherSeverity(a: Severity, b: Severity): Severity {
  return SEV_RANK[a] >= SEV_RANK[b] ? a : b;
}
function pickNewer(a: Vuln, b: Vuln): Vuln {
  return new Date(a.modifiedAt) >= new Date(b.modifiedAt) ? a : b;
}
function min(a: string, b: string): string { return a < b ? a : b; }
function max(a: string, b: string): string { return a > b ? a : b; }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @sec/scraper test dedupe
```
Expected: all passing.

---

### Task 11: Pipeline score (priority formula)

**Files:**
- Create: `apps/scraper/src/pipeline/score.ts`
- Test: `apps/scraper/src/pipeline/score.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/scraper/src/pipeline/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computePriority } from './score.js';
import type { Vuln } from '@sec/shared';

function base(o: Partial<Vuln>): Vuln {
  return {
    id: 'X', aliases: [], title: 't', summary: 's', severity: 'low',
    ecosystems: ['npm'], cwe: [], affected: [],
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0,
    publishedAt: new Date().toISOString(),
    modifiedAt:  new Date().toISOString(),
    mergedAt:    new Date().toISOString(),
    sources: [{ source:'s', externalId:'x', url:'https://x.example', fetchedAt: new Date().toISOString() }],
    tags: [], kev: false,
    ...o,
  } as Vuln;
}

describe('computePriority', () => {
  it('critical + direct-dep + fresh = ~85 to 100', () => {
    const p = computePriority(base({
      severity: 'critical',
      stackMatch: { score: 100, packages: ['next'], reason: 'direct-dep' },
    }));
    expect(p).toBe(85);  // 40 + 35 + 0 + 10
  });

  it('KEV floors to 85 even when score lower', () => {
    const p = computePriority(base({ severity: 'low', kev: true, stackMatch: { score: 0, packages: [], reason: 'topic-mention' } }));
    expect(p).toBe(85);
  });

  it('high CVSS in irrelevant package gets demoted', () => {
    const p = computePriority(base({
      severity: 'critical',
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    }));
    expect(p).toBe(Math.round(50 * 0.4));   // 40+0+0+10 = 50, demoted → 20
  });

  it('EPSS > 0.5 adds 10 to exploit signal', () => {
    const p = computePriority(base({
      severity: 'medium', epss: 0.6,
      stackMatch: { score: 100, packages: ['x'], reason: 'direct-dep' },
    }));
    expect(p).toBe(15 + 35 + 10 + 10);  // 70
  });

  it('AI/LLM tag floor uses stackMatch.score', () => {
    const p = computePriority(base({
      severity: 'low', tags: ['ai-llm'],
      stackMatch: { score: 60, packages: ['claude'], reason: 'direct-dep' },
    }));
    expect(p).toBeGreaterThanOrEqual(60);
  });

  it('older than 90 days gets 0 freshness', () => {
    const old = new Date(Date.now() - 200 * 86400 * 1000).toISOString();
    const p = computePriority(base({
      severity: 'high', publishedAt: old,
      stackMatch: { score: 100, packages: ['x'], reason: 'direct-dep' },
    }));
    expect(p).toBe(30 + 35 + 0 + 0);  // 65
  });

  it('clamps to [0,100]', () => {
    const p = computePriority(base({
      severity: 'critical', kev: true, epss: 1, cvss: 10,
      stackMatch: { score: 100, packages: ['x'], reason: 'direct-dep' },
    }));
    expect(p).toBeLessThanOrEqual(100);
    expect(p).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @sec/scraper test score
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `score.ts`**

```ts
import { SCORING_CONFIG, type Severity, type Vuln } from '@sec/shared';

const SEV_BASE: Record<Severity, number> = {
  critical: 40, high: 30, medium: 15, low: 5, unknown: 10,
};

export function computePriority(vuln: Vuln): number {
  const severityBase = SEV_BASE[vuln.severity];
  const stackContribution = Math.round(vuln.stackMatch.score * 0.35);
  const exploitSignal = computeExploitSignal(vuln);
  const freshnessBonus = computeFreshnessBonus(vuln.publishedAt);

  let p = severityBase + stackContribution + exploitSignal + freshnessBonus;

  if (vuln.kev) p = Math.max(p, SCORING_CONFIG.floors.kev);

  const irrelevant = vuln.stackMatch.score === 0 && !vuln.tags.includes('ai-llm');
  if (irrelevant) p = Math.round(p * SCORING_CONFIG.demoteWhenIrrelevantFactor);

  if (vuln.tags.includes('ai-llm')) p = Math.max(p, vuln.stackMatch.score);

  return Math.max(0, Math.min(100, Math.round(p)));
}

function computeExploitSignal(vuln: Vuln): number {
  if (vuln.kev) return 15;
  if (vuln.epss !== undefined) {
    if (vuln.epss > 0.5) return 10;
    if (vuln.epss > 0.1) return 5;
  }
  return 0;
}

function computeFreshnessBonus(publishedAt: string): number {
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  const days = ageMs / (86400 * 1000);
  if (days < 7) return 10;
  if (days < 30) return 5;
  if (days < 90) return 2;
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @sec/scraper test score
```
Expected: all passing.

---

### Task 12: Pipeline persist + archive rollover

**Files:**
- Create: `apps/scraper/src/pipeline/persist.ts`
- Test: `apps/scraper/src/pipeline/persist.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/scraper/src/pipeline/persist.test.ts`:

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { loadVulns, persistVulns, rolloverArchive } from './persist.js';
import type { Vuln } from '@sec/shared';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'persist-')); });
afterEach(()  => rmSync(dir, { recursive: true, force: true }));

function v(o: Partial<Vuln>): Vuln {
  return {
    id: 'X', aliases: [], title: 't', summary: 's', severity: 'low',
    ecosystems: ['npm'], cwe: [], affected: [],
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0,
    publishedAt: '2026-05-22T00:00:00Z',
    modifiedAt:  '2026-05-22T00:00:00Z',
    mergedAt:    '2026-05-22T00:00:00Z',
    sources: [{ source:'s', externalId:'x', url:'https://x.example', fetchedAt:'2026-05-22T00:00:00Z' }],
    tags: [], kev: false,
    ...o,
  } as Vuln;
}

describe('loadVulns', () => {
  it('returns [] if file missing', async () => {
    expect(await loadVulns(dir)).toEqual([]);
  });
});

describe('persistVulns', () => {
  it('writes vulns.json sorted by priority desc', async () => {
    await persistVulns(dir, [v({ id: 'A', priority: 10 }), v({ id: 'B', priority: 90 })]);
    const arr = JSON.parse(readFileSync(join(dir, 'vulns.json'), 'utf8')) as Vuln[];
    expect(arr[0]!.id).toBe('B');
    expect(arr[1]!.id).toBe('A');
  });
});

describe('rolloverArchive', () => {
  it('moves records older than 90d into monthly gzip', async () => {
    const old  = v({ id: 'OLD',    modifiedAt: '2026-01-01T00:00:00Z', publishedAt: '2026-01-01T00:00:00Z' });
    const fresh= v({ id: 'FRESH',  modifiedAt: '2026-05-22T00:00:00Z', publishedAt: '2026-05-22T00:00:00Z' });
    const { live, archived } = rolloverArchive([old, fresh], new Date('2026-05-22T00:00:00Z'));
    expect(live.map(x => x.id)).toEqual(['FRESH']);
    expect(archived['2026-01']).toBeDefined();
    expect(archived['2026-01']!.map(x => x.id)).toEqual(['OLD']);
  });

  it('keeps everything live within 90d', async () => {
    const within = v({ id: 'A', modifiedAt: '2026-04-15T00:00:00Z' });
    const { live, archived } = rolloverArchive([within], new Date('2026-05-22T00:00:00Z'));
    expect(live).toHaveLength(1);
    expect(Object.keys(archived)).toHaveLength(0);
  });
});

describe('persistVulns + archive', () => {
  it('writes gzipped monthly archive', async () => {
    const old   = v({ id: 'OLD',   modifiedAt: '2026-01-01T00:00:00Z', publishedAt: '2026-01-01T00:00:00Z' });
    const fresh = v({ id: 'FRESH', modifiedAt: '2026-05-22T00:00:00Z' });
    await persistVulns(dir, [old, fresh], new Date('2026-05-22T00:00:00Z'));
    const archivePath = join(dir, 'archive', '2026-01.json.gz');
    expect(existsSync(archivePath)).toBe(true);
    const data = JSON.parse(gunzipSync(readFileSync(archivePath)).toString('utf8')) as Vuln[];
    expect(data[0]!.id).toBe('OLD');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @sec/scraper test persist
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `persist.ts`**

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { ROLLING_WINDOW_DAYS, type Vuln } from '@sec/shared';

export async function loadVulns(dataDir: string): Promise<Vuln[]> {
  const f = join(dataDir, 'vulns.json');
  if (!existsSync(f)) return [];
  return JSON.parse(await readFile(f, 'utf8')) as Vuln[];
}

export async function persistVulns(dataDir: string, vulns: Vuln[], now = new Date()): Promise<void> {
  const { live, archived } = rolloverArchive(vulns, now);

  await mkdir(dataDir, { recursive: true });
  const sorted = [...live].sort((a, b) =>
    b.priority - a.priority ||
    (new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  );
  await writeFile(join(dataDir, 'vulns.json'), JSON.stringify(sorted, null, 2) + '\n');

  if (Object.keys(archived).length > 0) {
    const archiveDir = join(dataDir, 'archive');
    await mkdir(archiveDir, { recursive: true });
    for (const [month, records] of Object.entries(archived)) {
      const path = join(archiveDir, `${month}.json.gz`);
      const existing: Vuln[] = existsSync(path)
        ? JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'))
        : [];
      const byId = new Map<string, Vuln>();
      for (const r of existing) byId.set(r.id, r);
      for (const r of records) byId.set(r.id, r);
      const merged = [...byId.values()];
      await writeFile(path, gzipSync(Buffer.from(JSON.stringify(merged))));
    }
  }
}

export function rolloverArchive(vulns: Vuln[], now: Date): {
  live: Vuln[]; archived: Record<string, Vuln[]>;
} {
  const cutoff = now.getTime() - ROLLING_WINDOW_DAYS * 86400 * 1000;
  const live: Vuln[] = [];
  const archived: Record<string, Vuln[]> = {};
  for (const v of vulns) {
    if (new Date(v.modifiedAt).getTime() >= cutoff) {
      live.push(v);
    } else {
      const month = v.modifiedAt.slice(0, 7);  // 'YYYY-MM'
      (archived[month] ??= []).push(v);
    }
  }
  return { live, archived };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @sec/scraper test persist
```
Expected: all passing.

---

End of Phase 3. Phase 4 (Tier 1 adapters) continues next.
