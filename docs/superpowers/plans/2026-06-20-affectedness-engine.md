# Affectedness Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shallow stack matcher with a correct, explicit per-vuln *exposure* verdict (affected / safe / potential / unknown) that evaluates all advisory ranges with ecosystem-correct semantics, drives ranking (safe demoted, affected floored), and surfaces in the dashboard.

**Architecture:** A pure range evaluator (`version-ranges.ts`) answers "is installed version in this vulnerable range?" with `in|out|partial|unknown`. An aggregator (`exposure.ts`) runs it over every `vuln.affected` entry that names a stack package, picks the strongest verdict, and emits an `Exposure` plus a back-compat `StackMatch`. The scraper writes `exposure` onto each vuln; `score.ts` demotes `safe` and floors `affected`; the dashboard renders a badge and an "Affected only" filter.

**Tech Stack:** TypeScript (ESM, Node ≥24), `semver@^7.8` (already a dependency of `@sec/shared` and `@sec/scraper`), Zod v4 schemas, `node:test` + `node:assert/strict` run via `tsx --test`, Next.js 16 static-export dashboard, Zustand store.

## Global Constraints

- **Node ≥24, ESM.** All relative imports use `.js` specifiers (e.g. `from './version-ranges.js'`), matching the codebase.
- **No new dependencies.** Use the existing `semver` package only.
- **Tests use `node:test`** (`import { describe, it } from 'node:test'`, `import { strict as assert } from 'node:assert'`), placed under `apps/scraper/src/pipeline/__tests__/` — the only wired test runner (`pnpm --filter @sec/scraper test`). Engine source still lives in `@sec/shared`; tests import it via `@sec/shared`.
- **`exposure` is OPTIONAL on the schema** (`Exposure.optional()`), never `.default(...)` — the ~20 adapter `Vuln` literals must keep compiling, and `loadVulns`/dashboard parse raw JSON. All readers treat missing `exposure` as `unknown`.
- **`stackMatch` is retained and derived from the verdict** so existing sort (`stackmatch-desc`), `StackMatchChips`, and the `stackMatchOnly` filter keep working.
- **Do NOT commit or branch.** Per user preference, leave all changes **unstaged on `main`** for the user to review. Each task ends with verification (typecheck/tests), not a commit.
- **Verify command (full):** `pnpm -r typecheck` and `pnpm --filter @sec/scraper test`.

---

## File Structure

**`@sec/shared` (`packages/shared/src/`)**
- `constants.ts` — add `EXPOSURE_STATUSES`.
- `schemas.ts` — add `ExposureStatus`, `Exposure`, and `Vuln.exposure?`.
- `version-ranges.ts` *(new)* — `toSemverRange`, `evaluateRange`, `RangeVerdict`.
- `exposure.ts` *(new)* — `evaluateExposure(vuln, idx) → { exposure, stackMatch }`.
- `stack-matcher.ts` — reimplement `scoreStackMatch` to delegate to `evaluateExposure`; keep `buildStackIndex`/`StackIndex`; delete the old `versionSatisfies`.
- `scoring-config.ts` — add `floors.affected` and `demoteWhenSafeFactor`.
- `index.ts` — export the two new modules.

**`@sec/scraper` (`apps/scraper/src/`)**
- `pipeline/score.ts` — verdict-aware demote/floor; extend `ScoreBreakdown.floorApplied`.
- `main.ts` — call `evaluateExposure`, set `exposure` + `stackMatch`.
- `pipeline/__tests__/version-ranges.test.ts` *(new)*
- `pipeline/__tests__/exposure.test.ts` *(new)*
- `pipeline/__tests__/score.test.ts` *(new)*

**`@sec/dashboard` (`apps/dashboard/`)**
- `components/ExposureBadge.tsx` *(new)*
- `components/VulnRow.tsx` — render the badge.
- `lib/store.ts` — `affectedOnly` filter + persist `migrate`.
- `components/FilterSidebar.tsx` — "Affected only" toggle.
- `components/VulnListView.tsx` — apply the filter.

---

## Task 1: Exposure schema + constants

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/schemas.ts`
- Test: `apps/scraper/src/pipeline/__tests__/exposure.test.ts` (created here, expanded in Task 3)

**Interfaces:**
- Produces: `EXPOSURE_STATUSES: readonly ['affected','safe','potential','unknown']`; `ExposureStatus` (zod enum + type); `Exposure` (zod object + type) with fields `status: ExposureStatus`, optional `package`, `ecosystem`, `installed`, `vulnerableRange`, `fixedIn`; `Vuln.exposure?: Exposure`.

- [ ] **Step 1: Write the failing test**

Create `apps/scraper/src/pipeline/__tests__/exposure.test.ts`:

```ts
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { Exposure, Vuln, EXPOSURE_STATUSES } from '@sec/shared';

describe('Exposure schema', () => {
  it('exposes the four statuses', () => {
    assert.deepEqual([...EXPOSURE_STATUSES], ['affected', 'safe', 'potential', 'unknown']);
  });

  it('parses a full exposure object', () => {
    const e = Exposure.parse({
      status: 'affected',
      package: 'next',
      ecosystem: 'npm',
      installed: '14.2.35',
      vulnerableRange: '>=14.0.0 <14.2.36',
      fixedIn: '14.2.36',
    });
    assert.equal(e.status, 'affected');
    assert.equal(e.package, 'next');
  });

  it('accepts a vuln WITHOUT an exposure field (optional)', () => {
    const base = {
      id: 'CVE-1', aliases: [], title: 't', summary: '', severity: 'high',
      ecosystems: [], cwe: [], affected: [],
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0, kev: false,
      publishedAt: '2020-01-01T00:00:00.000Z', modifiedAt: '2020-01-01T00:00:00.000Z',
      mergedAt: '2020-01-01T00:00:00.000Z',
      sources: [{ source: 's', externalId: 'x', url: 'https://e.com', fetchedAt: '2020-01-01T00:00:00.000Z' }],
      tags: [],
    };
    const parsed = Vuln.parse(base);
    assert.equal(parsed.exposure, undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sec/scraper exec tsx --test src/pipeline/__tests__/exposure.test.ts`
Expected: FAIL — `EXPOSURE_STATUSES`/`Exposure` are not exported.

- [ ] **Step 3: Add the constant**

In `packages/shared/src/constants.ts`, after the `SEVERITIES` block, add:

```ts
export const EXPOSURE_STATUSES = ['affected', 'safe', 'potential', 'unknown'] as const;
```

- [ ] **Step 4: Add the schema**

In `packages/shared/src/schemas.ts`:

Update the import line at the top to include the new constant:

```ts
import { ECOSYSTEMS, EXPOSURE_STATUSES, SEVERITIES, TAGS } from './constants';
```

Add after the `Affected` schema block (before `export const Vuln`):

```ts
export const ExposureStatus = z.enum(EXPOSURE_STATUSES);
export type ExposureStatus = z.infer<typeof ExposureStatus>;

export const Exposure = z.object({
  status: ExposureStatus,
  package: z.string().optional(),
  ecosystem: Ecosystem.optional(),
  installed: z.string().optional(),
  vulnerableRange: z.string().optional(),
  fixedIn: z.string().optional(),
});
export type Exposure = z.infer<typeof Exposure>;
```

Inside the `Vuln` object, add this line right after `stackMatch: StackMatch,`:

```ts
  exposure: Exposure.optional(),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @sec/scraper exec tsx --test src/pipeline/__tests__/exposure.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck and leave unstaged**

Run: `pnpm -r typecheck`
Expected: no errors. Leave changes unstaged (do not commit).

---

## Task 2: Version range evaluator

**Files:**
- Create: `packages/shared/src/version-ranges.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/scraper/src/pipeline/__tests__/version-ranges.test.ts`

**Interfaces:**
- Consumes: `Ecosystem` from `@sec/shared`.
- Produces:
  - `type RangeVerdict = 'in' | 'out' | 'partial' | 'unknown'`
  - `toSemverRange(range: string): string | null`
  - `evaluateRange(ecosystem: Ecosystem, installed: string, vulnerable: string): RangeVerdict`

- [ ] **Step 1: Write the failing test**

Create `apps/scraper/src/pipeline/__tests__/version-ranges.test.ts`:

```ts
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluateRange, toSemverRange } from '@sec/shared';

describe('toSemverRange', () => {
  it('treats comma as AND, not OR', () => {
    assert.equal(toSemverRange('>=1.0.0, <2.0.0'), '>=1.0.0 <2.0.0');
  });
  it('keeps || as OR', () => {
    assert.equal(toSemverRange('<1.0.0 || >=2.0.0'), '<1.0.0 || >=2.0.0');
  });
  it('maps any/empty/* to *', () => {
    assert.equal(toSemverRange('any'), '*');
    assert.equal(toSemverRange(''), '*');
  });
  it('returns null for unparseable input', () => {
    assert.equal(toSemverRange('garbage~~'), null);
  });
});

describe('evaluateRange: npm pinned installed version', () => {
  it('in-range -> in', () => {
    assert.equal(evaluateRange('npm', '14.2.35', '>=14.0.0 <15.0.0'), 'in');
  });
  it('out-of-range -> out', () => {
    assert.equal(evaluateRange('npm', '14.2.35', '<13.0.0'), 'out');
  });
  it('comma-AND is intersection: 2.5.0 not in >=1.0.0, <2.0.0', () => {
    assert.equal(evaluateRange('npm', '2.5.0', '>=1.0.0, <2.0.0'), 'out');
  });
  it('comma-AND is intersection: 1.5.0 in >=1.0.0, <2.0.0', () => {
    assert.equal(evaluateRange('npm', '1.5.0', '>=1.0.0, <2.0.0'), 'in');
  });
  it('OR range matches the upper clause', () => {
    assert.equal(evaluateRange('npm', '2.5.0', '<1.0.0 || >=2.0.0 <3.0.0'), 'in');
  });
  it('hyphen range', () => {
    assert.equal(evaluateRange('npm', '1.2.5', '1.0.0 - 1.5.0'), 'in');
  });
  it('"any" vulnerable range -> in', () => {
    assert.equal(evaluateRange('npm', '14.2.35', 'any'), 'in');
  });
  it('unparseable vulnerable range -> unknown', () => {
    assert.equal(evaluateRange('npm', '14.2.35', 'garbage~~'), 'unknown');
  });
});

describe('evaluateRange: composer constraint installed (range vs range)', () => {
  it('overlapping constraint -> partial', () => {
    assert.equal(evaluateRange('composer', '^6.4', '>=6.4.0 <6.4.9'), 'partial');
  });
  it('disjoint constraint -> out', () => {
    assert.equal(evaluateRange('composer', '^6.4', '<6.0.0'), 'out');
  });
});

describe('evaluateRange: unversioned tracking ("*")', () => {
  it('specific vulnerable range -> partial', () => {
    assert.equal(evaluateRange('ai-llm', '*', '<1.0.0'), 'partial');
  });
  it('everything vulnerable -> in', () => {
    assert.equal(evaluateRange('ai-llm', '*', 'any'), 'in');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sec/scraper exec tsx --test src/pipeline/__tests__/version-ranges.test.ts`
Expected: FAIL — `evaluateRange`/`toSemverRange` not exported.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/version-ranges.ts`:

```ts
import semver from 'semver';
import type { Ecosystem } from './schemas';

export type RangeVerdict = 'in' | 'out' | 'partial' | 'unknown';

/**
 * Translate an advisory/constraint range into a semver-valid range string.
 * - comma means AND (advisory convention): ">=1.0, <2.0" -> ">=1.0 <2.0"
 * - "||" means OR (preserved)
 * - "any"/""/"*" -> "*"
 * Composer operators (^ ~ * .x hyphen) are already valid semver range syntax.
 * Returns null when the result is not a valid semver range.
 */
export function toSemverRange(range: string): string | null {
  const r = (range ?? '').trim();
  if (!r || r.toLowerCase() === 'any' || r === '*') return '*';
  const candidate = r
    .split('||')
    .map((or) =>
      or
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join(' || ');
  return semver.validRange(candidate, { loose: true }) ? candidate : null;
}

/**
 * Decide whether an installed version/constraint falls inside a vulnerable range.
 * `ecosystem` is currently advisory-agnostic (npm + Composer both map onto
 * semver range syntax) but is kept in the signature for future divergence.
 */
export function evaluateRange(
  _ecosystem: Ecosystem,
  installed: string,
  vulnerable: string,
): RangeVerdict {
  const vulnRange = toSemverRange(vulnerable);
  if (vulnRange === null) return 'unknown';

  // Unversioned tracking (e.g. tools pinned to "*"): cannot rule ourselves out.
  if (installed === '*' || installed.toLowerCase() === 'any') {
    return vulnRange === '*' ? 'in' : 'partial';
  }

  // Installed pinned to a concrete version (typical npm): decide precisely.
  if (semver.valid(installed)) {
    return semver.satisfies(installed, vulnRange, { includePrerelease: true }) ? 'in' : 'out';
  }

  // Installed is itself a constraint (typical Composer "^6.4"): overlap test.
  const instRange = toSemverRange(installed);
  if (instRange === null) return 'unknown';
  try {
    return semver.intersects(instRange, vulnRange, { loose: true }) ? 'partial' : 'out';
  } catch {
    return 'unknown';
  }
}
```

- [ ] **Step 4: Export from the package index**

In `packages/shared/src/index.ts`, add after the existing exports:

```ts
export * from './version-ranges';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @sec/scraper exec tsx --test src/pipeline/__tests__/version-ranges.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Typecheck and leave unstaged**

Run: `pnpm -r typecheck`
Expected: no errors. Leave changes unstaged.

---

## Task 3: Exposure aggregator + stack-matcher delegation

**Files:**
- Create: `packages/shared/src/exposure.ts`
- Modify: `packages/shared/src/stack-matcher.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/scraper/src/pipeline/__tests__/exposure.test.ts` (expand from Task 1)

**Interfaces:**
- Consumes: `evaluateRange` (Task 2); `StackIndex`, `buildStackIndex` from `./stack-matcher`; `Vuln`, `StackMatch`, `Exposure`, `Ecosystem` from `./schemas`.
- Produces: `evaluateExposure(vuln: Vuln, idx: StackIndex): { exposure: Exposure; stackMatch: StackMatch }`. After this task `scoreStackMatch(vuln, idx)` returns `evaluateExposure(...).stackMatch`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/scraper/src/pipeline/__tests__/exposure.test.ts`:

```ts
import { buildStackIndex, evaluateExposure, type Stack, type Vuln, type Affected } from '@sec/shared';

const stack: Stack = {
  frontend: { next: '14.2.35', react: '18.3.1', lodash: '4.17.21' },
  backend: { 'symfony/symfony': '^6.4' },
  tools: { claude: '*' },
};
const idx = buildStackIndex(stack);

function vulnWith(affected: Affected[], title = '', summary = ''): Vuln {
  return {
    id: 'CVE-X', aliases: [], title, summary, severity: 'high',
    ecosystems: [], cwe: [], affected,
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0, kev: false,
    publishedAt: '2020-01-01T00:00:00.000Z', modifiedAt: '2020-01-01T00:00:00.000Z',
    mergedAt: '2020-01-01T00:00:00.000Z',
    sources: [{ source: 's', externalId: 'x', url: 'https://e.com', fetchedAt: '2020-01-01T00:00:00.000Z' }],
    tags: [],
  } as Vuln;
}

describe('evaluateExposure', () => {
  it('exact in-range hit -> affected, score 100', () => {
    const { exposure, stackMatch } = evaluateExposure(
      vulnWith([{ ecosystem: 'npm', package: 'next', versions: '>=14.0.0 <14.2.36' }]), idx);
    assert.equal(exposure.status, 'affected');
    assert.equal(exposure.package, 'next');
    assert.equal(exposure.installed, '14.2.35');
    assert.equal(stackMatch.score, 100);
    assert.equal(stackMatch.reason, 'direct-dep');
  });

  it('out-of-range stack package -> safe, score 20', () => {
    const { exposure, stackMatch } = evaluateExposure(
      vulnWith([{ ecosystem: 'npm', package: 'next', versions: '<13.0.0' }]), idx);
    assert.equal(exposure.status, 'safe');
    assert.equal(stackMatch.score, 20);
  });

  it('is order-independent: affected wins over an earlier safe entry', () => {
    const { exposure } = evaluateExposure(
      vulnWith([
        { ecosystem: 'npm', package: 'react', versions: '<17.0.0' },          // safe (react 18.3.1)
        { ecosystem: 'npm', package: 'lodash', versions: '>=4.0.0 <4.18.0' }, // affected (4.17.21)
      ]), idx);
    assert.equal(exposure.status, 'affected');
    assert.equal(exposure.package, 'lodash');
  });

  it('composer constraint overlap -> potential, score 60', () => {
    const { exposure, stackMatch } = evaluateExposure(
      vulnWith([{ ecosystem: 'composer', package: 'symfony/symfony', versions: '>=6.4.0 <6.4.9' }]), idx);
    assert.equal(exposure.status, 'potential');
    assert.equal(stackMatch.score, 60);
  });

  it('open range but already past fixedIn -> safe', () => {
    const { exposure } = evaluateExposure(
      vulnWith([{ ecosystem: 'npm', package: 'next', versions: '>=0.0.0', fixedIn: '13.0.0' }]), idx);
    assert.equal(exposure.status, 'safe');
  });

  it('no structured match but topic mention -> unknown, score 40', () => {
    const { exposure, stackMatch } = evaluateExposure(vulnWith([], 'lodash prototype pollution'), idx);
    assert.equal(exposure.status, 'unknown');
    assert.equal(stackMatch.score, 40);
    assert.equal(stackMatch.reason, 'topic-mention');
  });

  it('no match at all -> unknown, score 0', () => {
    const { exposure, stackMatch } = evaluateExposure(vulnWith([], 'unrelated kernel bug'), idx);
    assert.equal(exposure.status, 'unknown');
    assert.equal(stackMatch.score, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sec/scraper exec tsx --test src/pipeline/__tests__/exposure.test.ts`
Expected: FAIL — `evaluateExposure` not exported.

- [ ] **Step 3: Write the aggregator**

Create `packages/shared/src/exposure.ts`:

```ts
import semver from 'semver';
import type { Ecosystem, Exposure, ExposureStatus, StackMatch, Vuln } from './schemas';
import type { StackIndex } from './stack-matcher';
import { evaluateRange } from './version-ranges';

const STATUS_RANK: Record<ExposureStatus, number> = {
  affected: 3,
  potential: 2,
  safe: 1,
  unknown: 0,
};

export function evaluateExposure(
  vuln: Vuln,
  idx: StackIndex,
): { exposure: Exposure; stackMatch: StackMatch } {
  let best: Exposure = { status: 'unknown' };
  const matched: string[] = [];

  for (const aff of vuln.affected) {
    const key = aff.package.toLowerCase();
    const installed = idx.byName.get(key);
    if (installed === undefined) continue;
    const original = idx.originalCase.get(key) ?? aff.package;
    matched.push(original);

    const status = classify(aff.ecosystem, installed, aff.versions, aff.fixedIn);
    if (STATUS_RANK[status] > STATUS_RANK[best.status]) {
      best = {
        status,
        package: original,
        ecosystem: aff.ecosystem,
        installed,
        vulnerableRange: aff.versions,
        ...(aff.fixedIn ? { fixedIn: aff.fixedIn } : {}),
      };
    }
  }

  if (best.status !== 'unknown') {
    const score = best.status === 'affected' ? 100 : best.status === 'potential' ? 60 : 20;
    return {
      exposure: best,
      stackMatch: { score, packages: [...new Set(matched)], reason: 'direct-dep' },
    };
  }

  // No structured affected entry named a stack dep — fall back to topic mention.
  const haystack = `${vuln.title}\n${vuln.summary}`.toLowerCase();
  const mentions: string[] = [];
  for (const name of idx.allLower) {
    if (name.length < 4) continue;
    if (haystack.includes(name)) mentions.push(idx.originalCase.get(name) ?? name);
  }
  if (mentions.length > 0) {
    return {
      exposure: { status: 'unknown' },
      stackMatch: { score: 40, packages: [...new Set(mentions)], reason: 'topic-mention' },
    };
  }
  return { exposure: { status: 'unknown' }, stackMatch: { score: 0, packages: [], reason: 'topic-mention' } };
}

function classify(
  ecosystem: Ecosystem,
  installed: string,
  vulnerable: string,
  fixedIn: string | undefined,
): ExposureStatus {
  const verdict = evaluateRange(ecosystem, installed, vulnerable);
  if (verdict === 'in') {
    if (fixedIn && isAtOrAbove(installed, fixedIn)) return 'safe';
    return 'affected';
  }
  if (verdict === 'out') return 'safe';
  return 'potential'; // 'partial' | 'unknown'
}

function isAtOrAbove(installed: string, fixedIn: string): boolean {
  const inst = semver.valid(installed) ? installed : semver.coerce(installed)?.version;
  const fix = semver.valid(fixedIn) ? fixedIn : semver.coerce(fixedIn)?.version;
  if (!inst || !fix) return false;
  return semver.gte(inst, fix);
}
```

- [ ] **Step 4: Delegate `scoreStackMatch` and export**

Replace the body of `scoreStackMatch` and remove the now-dead `versionSatisfies` in `packages/shared/src/stack-matcher.ts`. The file becomes:

```ts
import type { Stack, StackMatch, Vuln } from './schemas';
import { evaluateExposure } from './exposure';

export interface StackIndex {
  byName: Map<string, string>;
  allLower: string[];
  originalCase: Map<string, string>;
}

export function buildStackIndex(stack: Stack): StackIndex {
  const byName = new Map<string, string>();
  const originalCase = new Map<string, string>();
  for (const category of [stack.frontend, stack.backend, stack.tools]) {
    for (const [pkg, version] of Object.entries(category)) {
      const k = pkg.toLowerCase();
      byName.set(k, version);
      originalCase.set(k, pkg);
    }
  }
  return { byName, allLower: [...byName.keys()], originalCase };
}

export function scoreStackMatch(vuln: Vuln, idx: StackIndex): StackMatch {
  return evaluateExposure(vuln, idx).stackMatch;
}
```

In `packages/shared/src/index.ts`, add after the `version-ranges` export:

```ts
export * from './exposure';
```

Note: `exposure.ts` imports `StackIndex` from `stack-matcher.ts` as a **type only**, and `stack-matcher.ts` imports `evaluateExposure` at runtime — a one-way runtime dependency, no cycle.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @sec/scraper exec tsx --test src/pipeline/__tests__/exposure.test.ts`
Expected: PASS (all tests from Tasks 1 and 3).

- [ ] **Step 6: Typecheck and leave unstaged**

Run: `pnpm -r typecheck`
Expected: no errors. Leave changes unstaged.

---

## Task 4: Verdict-aware scoring

**Files:**
- Modify: `packages/shared/src/scoring-config.ts`
- Modify: `apps/scraper/src/pipeline/score.ts`
- Test: `apps/scraper/src/pipeline/__tests__/score.test.ts`

**Interfaces:**
- Consumes: `SCORING_CONFIG` (with new `floors.affected`, `demoteWhenSafeFactor`); `Vuln.exposure`.
- Produces: `computePriority(vuln)` and `scoreWithBreakdown(vuln)` now demote `exposure.status === 'safe'` and floor `affected` high/critical; `ScoreBreakdown.floorApplied` gains `'affected'`.

- [ ] **Step 1: Write the failing test**

Create `apps/scraper/src/pipeline/__tests__/score.test.ts`:

```ts
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Vuln } from '@sec/shared';
import { scoreWithBreakdown } from '../score.js';

// publishedAt in 2020 keeps freshness at 0 so totals are deterministic.
function v(partial: Partial<Vuln>): Vuln {
  return {
    id: 'CVE-X', aliases: [], title: 't', summary: '', severity: 'high',
    ecosystems: [], cwe: [], affected: [],
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0, kev: false,
    publishedAt: '2020-01-01T00:00:00.000Z', modifiedAt: '2020-01-01T00:00:00.000Z',
    mergedAt: '2020-01-01T00:00:00.000Z',
    sources: [{ source: 's', externalId: 'x', url: 'https://e.com', fetchedAt: '2020-01-01T00:00:00.000Z' }],
    tags: [],
    ...partial,
  } as Vuln;
}

describe('scoreWithBreakdown: exposure verdict', () => {
  it('demotes a safe high-severity vuln', () => {
    // base 30 (high) + 20*0.35 (stackMatch) = 37, then *0.25 safe demote -> 9.
    const r = scoreWithBreakdown(v({
      severity: 'high',
      stackMatch: { score: 20, packages: ['next'], reason: 'direct-dep' },
      exposure: { status: 'safe' },
    }));
    assert.equal(r.demoted, true);
    assert.equal(r.total, 9);
  });

  it('floors an affected high-severity vuln to 75', () => {
    // base 30 + 100*0.35 = 65, floored up to 75.
    const r = scoreWithBreakdown(v({
      severity: 'high',
      stackMatch: { score: 100, packages: ['lodash'], reason: 'direct-dep' },
      exposure: { status: 'affected' },
    }));
    assert.equal(r.total, 75);
    assert.equal(r.floorApplied, 'affected');
  });

  it('leaves a potential vuln undemoted', () => {
    const r = scoreWithBreakdown(v({
      severity: 'high',
      stackMatch: { score: 60, packages: ['symfony/symfony'], reason: 'direct-dep' },
      exposure: { status: 'potential' },
    }));
    assert.equal(r.demoted, false);
  });

  it('still demotes a fully irrelevant vuln (stackMatch 0, not ai-llm)', () => {
    const r = scoreWithBreakdown(v({ severity: 'high', exposure: { status: 'unknown' } }));
    assert.equal(r.demoted, true);
  });

  it('KEV floor still applies', () => {
    const r = scoreWithBreakdown(v({ severity: 'low', kev: true, exposure: { status: 'unknown' } }));
    assert.equal(r.total, 85);
    assert.equal(r.floorApplied, 'kev');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sec/scraper exec tsx --test src/pipeline/__tests__/score.test.ts`
Expected: FAIL — `demoteWhenSafeFactor`/`floors.affected` undefined, safe not demoted, affected not floored.

- [ ] **Step 3: Extend the scoring config**

Replace `packages/shared/src/scoring-config.ts` with:

```ts
export const SCORING_CONFIG = {
  weights: { severity: 40, stackMatch: 35, exploit: 15, freshness: 10 },
  thresholds: { push: { priority: 80, stackMatch: 60 } },
  decay: { halfLifeDays: 30 },
  floors: { kev: 85, affected: 75 },
  demoteWhenIrrelevantFactor: 0.4,
  demoteWhenSafeFactor: 0.25,
} as const;
```

- [ ] **Step 4: Make `score.ts` verdict-aware**

In `apps/scraper/src/pipeline/score.ts`:

Change the `floorApplied` type in the `ScoreBreakdown` interface:

```ts
  floorApplied?: 'kev' | 'ai-llm' | 'affected';
```

In `scoreWithBreakdown`, add the status read near the top of the function (after `const severityBase = ...`):

```ts
  const status = vuln.exposure?.status ?? 'unknown';
```

Then, in the block after `let total = severityBase + stackMatch + exploit + freshness;` and the existing irrelevant-demote, add the safe demote immediately after the irrelevant-demote `if`:

```ts
  if (status === 'safe') {
    total *= SCORING_CONFIG.demoteWhenSafeFactor;
    demoted = true;
  }
```

And add the affected floor immediately after the existing `if (vuln.kev) { ... }` block:

```ts
  if (status === 'affected' && (vuln.severity === 'critical' || vuln.severity === 'high')) {
    total = Math.max(total, SCORING_CONFIG.floors.affected);
    floorApplied = floorApplied ?? 'affected';
  }
```

(The KEV floor keeps priority; a patched-but-KEV item is rare and intentionally stays visible.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @sec/scraper exec tsx --test src/pipeline/__tests__/score.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Run the full suite and typecheck**

Run: `pnpm --filter @sec/scraper test` then `pnpm -r typecheck`
Expected: all tests pass; no type errors. Leave changes unstaged.

---

## Task 5: Wire the engine into the scraper run

**Files:**
- Modify: `apps/scraper/src/main.ts`

**Interfaces:**
- Consumes: `evaluateExposure` from `@sec/shared`; `computePriority` from `@/pipeline/score.js`.
- Produces: every persisted vuln carries `exposure` and a verdict-derived `stackMatch`, then `priority`.

- [ ] **Step 1: Swap the import**

In `apps/scraper/src/main.ts`, in the `@sec/shared` import block (lines ~1–8), remove `scoreStackMatch` and add `evaluateExposure`:

```ts
import {
  CADENCE_MS,
  ROLLING_WINDOW_DAYS,
  evaluateExposure,
  type LastRun,
  type SourcesFile,
  type Vuln,
} from '@sec/shared';
```

- [ ] **Step 2: Replace the scoring map**

Replace the block at `main.ts:134-138`:

```ts
  combined = combined.map((v) => {
    const sm = scoreStackMatch(v, stackIndex);
    const withMatch: Vuln = { ...v, stackMatch: sm };
    return { ...withMatch, priority: computePriority(withMatch) };
  });
```

with:

```ts
  combined = combined.map((v) => {
    const { exposure, stackMatch } = evaluateExposure(v, stackIndex);
    const withMatch: Vuln = { ...v, exposure, stackMatch };
    return { ...withMatch, priority: computePriority(withMatch) };
  });
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -r typecheck`
Expected: no errors (no remaining `scoreStackMatch` reference in `main.ts`).

- [ ] **Step 4: Smoke-test the pipeline (offline-safe)**

Run a dry-run against one source and confirm vulns gain an `exposure`. This hits the network (GHSA); if offline, skip and rely on the unit tests.

Run: `pnpm --filter @sec/scraper exec tsx -e "import('./src/main.ts').then(async (m) => { const r = await m.runScrape({ dryRun: true, noNotify: true, onlySource: 'ghsa', dataRoot: new URL('../../data', import.meta.url).pathname }); console.log('errors', r.errors.length); })"`
Expected: completes without throwing; `errors 0` (or a network error if offline). No files written (dry-run).

- [ ] **Step 5: Leave unstaged**

Leave changes unstaged (do not commit).

---

## Task 6: Exposure badge in the dashboard row

**Files:**
- Create: `apps/dashboard/components/ExposureBadge.tsx`
- Modify: `apps/dashboard/components/VulnRow.tsx`

**Interfaces:**
- Consumes: `Exposure` type from `@sec/shared`.
- Produces: `<ExposureBadge exposure={vuln.exposure} />` — renders nothing for `undefined`/`unknown`.

- [ ] **Step 1: Create the badge**

Create `apps/dashboard/components/ExposureBadge.tsx`:

```tsx
import type { Exposure } from '@sec/shared';

const STYLES: Record<'affected' | 'potential' | 'safe', string> = {
  affected: 'bg-red-500/20 text-red-300 border-red-500/40',
  potential: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  safe: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
};

const LABELS: Record<'affected' | 'potential' | 'safe', string> = {
  affected: 'Affected',
  potential: 'Potential',
  safe: 'Safe',
};

export function ExposureBadge({ exposure }: { exposure?: Exposure }) {
  const status = exposure?.status;
  if (!status || status === 'unknown') return null;
  const patch = status === 'affected' && exposure?.fixedIn ? ` · patch ${exposure.fixedIn}` : '';
  const title = exposure?.package
    ? `${exposure.package} ${exposure.installed ?? ''}`.trim()
    : undefined;
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold ${STYLES[status]}`}
    >
      {LABELS[status]}
      {patch}
    </span>
  );
}
```

- [ ] **Step 2: Render it in the row**

In `apps/dashboard/components/VulnRow.tsx`:

Add the import beside the other component imports:

```tsx
import { ExposureBadge } from './ExposureBadge';
```

Insert the badge right after `<SeverityPill severity={vuln.severity} />` (inside the `flex flex-wrap items-center gap-2` div):

```tsx
            <SeverityPill severity={vuln.severity} />
            <ExposureBadge exposure={vuln.exposure} />
```

- [ ] **Step 3: Typecheck the dashboard**

Run: `pnpm --filter @sec/dashboard typecheck`
Expected: no errors.

- [ ] **Step 4: Visual check (manual) and leave unstaged**

Run: `pnpm dev`, open http://localhost:3000. Confirm rows for affected/safe/potential vulns show the badge (after a scrape has populated `exposure`; pre-existing data without it shows no badge — expected). Stop the dev server. Leave changes unstaged.

---

## Task 7: "Affected only" filter

**Files:**
- Modify: `apps/dashboard/lib/store.ts`
- Modify: `apps/dashboard/components/FilterSidebar.tsx`
- Modify: `apps/dashboard/components/VulnListView.tsx`

**Interfaces:**
- Consumes: `filters.affectedOnly: boolean`; `vuln.exposure?.status`.
- Produces: a persisted `affectedOnly` filter (default `false`) that restricts the list to `exposure.status === 'affected'`.

- [ ] **Step 1: Add the filter to the store**

In `apps/dashboard/lib/store.ts`:

Add `affectedOnly: boolean;` to the `Filters` interface (after `kevOnly: boolean;`):

```ts
  kevOnly: boolean;
  affectedOnly: boolean;
```

Add it to `DEFAULT_FILTERS` (after `kevOnly: false,`):

```ts
  kevOnly: false,
  affectedOnly: false,
```

Bump the persist version and add a `migrate` that backfills new filter keys without discarding `readIds`/`hiddenIds`. Change the persist options object (currently `name`, `version: 2`, `partialize`) to:

```ts
    {
      name: 'sec-scraper-store',
      version: 3,
      migrate: (persisted: unknown) => {
        const s = (persisted ?? {}) as Record<string, unknown>;
        const filters = (s.filters ?? {}) as Partial<Filters>;
        return { ...s, filters: { ...DEFAULT_FILTERS, ...filters } } as never;
      },
      partialize: (s) => ({
        readIds: s.readIds,
        hiddenIds: s.hiddenIds,
        filters: s.filters,
        query: s.query,
        sort: s.sort,
      }),
    },
```

- [ ] **Step 2: Add the sidebar toggle**

In `apps/dashboard/components/FilterSidebar.tsx`, inside the `Display` `<ul>`, add this as the first `<li>` (before the "Stack match only" item):

```tsx
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1 hover:text-[var(--color-fg)]">
            <input
              type="checkbox"
              checked={filters.affectedOnly}
              onChange={(e) => setFilters({ affectedOnly: e.target.checked })}
            />
            <span>Affected only</span>
          </label>
        </li>
```

- [ ] **Step 3: Apply the filter in the list view**

In `apps/dashboard/components/VulnListView.tsx`, inside the `filtered` `useMemo`, add after the `kevOnly` block:

```ts
    if (filters.affectedOnly) {
      out = out.filter((v) => v.exposure?.status === 'affected');
    }
```

- [ ] **Step 4: Typecheck the dashboard**

Run: `pnpm --filter @sec/dashboard typecheck`
Expected: no errors.

- [ ] **Step 5: Manual check and leave unstaged**

Run: `pnpm dev`. Toggle "Affected only" and confirm the list narrows to affected vulns and the count updates; untoggle restores. Stop the dev server. Leave changes unstaged.

---

## Final verification

- [ ] **Run the full test suite:** `pnpm --filter @sec/scraper test` — all pass.
- [ ] **Typecheck everything:** `pnpm -r typecheck` — no errors.
- [ ] **Lint:** `pnpm lint` — no new errors.
- [ ] Confirm the working tree shows the expected modified/created files, all **unstaged** on `main`. Do not commit.

---

## Self-Review

**Spec coverage:**
- Data model (`Exposure`, `Vuln.exposure`) → Task 1. *(Refinement vs. spec: `.optional()` instead of `.default()` — Global Constraints explain why: avoids breaking ~20 adapter literals and matches raw-JSON loading. Behavior is identical: missing ⇒ `unknown`.)*
- All-entries / order-independent / ecosystem-correct evaluation → Tasks 2 (range engine) + 3 (aggregation), with explicit tests for comma-AND, OR, composer overlap, order independence, fixedIn.
- Verdict-driven scoring (safe demoted, affected floored, potential/unknown unchanged, KEV/irrelevant retained) → Task 4.
- Pipeline wiring → Task 5.
- Dashboard badge + "Affected only" filter → Tasks 6 + 7.
- Back-compat (`stackMatch` retained/derived; existing sort/chips/filter intact) → Task 3 Step 4 + verified by Task 4's reliance on `stackMatch.score`.
- Tests follow the existing `node:test` pattern → all test steps. *(Relocated from the spec's `packages/shared/src/__tests__` to the scraper test tree — the only wired runner; noted in Global Constraints.)*
- Golden snapshot → **intentionally deferred** (node:test snapshots are experimental); replaced by exhaustive unit cases. Open decision, non-blocking.

**Placeholder scan:** none — every code step shows complete content; every run step has an exact command and expected result.

**Type consistency:** `evaluateExposure` returns `{ exposure, stackMatch }` (used identically in Task 3 tests and Task 5 wiring). `RangeVerdict` values `in|out|partial|unknown` map to `ExposureStatus` via `classify`. `ExposureStatus` = `affected|safe|potential|unknown` consistent across schema, aggregator, score, badge, filter. `floorApplied` union extended to include `'affected'` before it is assigned. `SCORING_CONFIG.floors.affected` / `demoteWhenSafeFactor` defined in Task 4 Step 3 before use in Step 4.

**Open decisions carried from spec (non-blocking):** Composer comparator = in-house `semver`-based translator (implemented in Task 2, no new dep); scoring constants `floors.affected=75` / `demoteWhenSafeFactor=0.25` are initial, tunable; ecosystem-aware tie-breaking deferred (match-by-name baseline).
