# Dashboard Mobile Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Next.js dashboard usable on phones (≤640 px) and small tablets (640–1024 px) by adding a filter drawer for `<lg`, always-visible row actions on touch, 36 px tap targets, multi-line title on mobile, sticky header, stacked metadata, and a collapsible source-health footer.

**Architecture:** Component-level edits across `apps/dashboard/`. Filter drawer is a responsive variant of the existing `FilterSidebar` (one component, two layouts based on Tailwind breakpoint). A new `filtersOpen` UI-only state lives in the existing zustand store. `SourceHealth` becomes a client component (was server) to support a collapse toggle on mobile. No new dependencies, no architectural change.

**Tech Stack:** Next.js 16 (static export), React 19, Tailwind v4, Zustand v5, native HTML/CSS, no animation libraries.

**Verification approach:** Codebase has no Playwright or Vitest tests. Each task verifies via:
- `pnpm typecheck` (compile correctness)
- `pnpm lint` (ESLint)
- Manual: `pnpm dev` then open `http://localhost:3000` in the browser at multiple viewports (use devtools responsive mode):
  - 390 × 844 (iPhone 13)
  - 768 × 1024 (iPad portrait)
  - 1024 × 1366 (iPad landscape / small laptop)
  - 1440 × 900 (laptop)

**Spec:** `docs/superpowers/specs/2026-05-22-mobile-usability-design.md`

---

## Task 1: Add `filtersOpen` state to the zustand store

**Files:**
- Modify: `apps/dashboard/lib/store.ts`

- [ ] **Step 1: Add the state field and setter**

Open `apps/dashboard/lib/store.ts`. Inside the `interface State` block, after `setSort` and before `reset`, add:

```typescript
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
```

Inside `create<State>()(...)` factory body (around the existing `markRead`, `unmarkRead` definitions), add the initial value and setter:

After:
```typescript
      readIds: [],
      hiddenIds: [],
```
add:
```typescript
      filtersOpen: false,
```

After the `setSort` line, add:
```typescript
      setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
```

- [ ] **Step 2: Exclude `filtersOpen` from persistence**

The current `persist` config persists the whole state. Filter drawer state shouldn't survive page reloads (otherwise drawer would re-open on mobile after every refresh).

The spec called for a version bump from 2 → 3, but that would discard existing users' `readIds` and `hiddenIds` (zustand drops state on version mismatch unless a `migrate` function is provided). `filtersOpen` is a new field, so it can't have been persisted under v2. Keep `version: 2`; `partialize` alone is sufficient.

Change the `persist` config call at the bottom of the file from:
```typescript
    { name: 'sec-scraper-store', version: 2 },
```
to:
```typescript
    {
      name: 'sec-scraper-store',
      version: 2,
      partialize: (s) => ({
        readIds: s.readIds,
        hiddenIds: s.hiddenIds,
        filters: s.filters,
        query: s.query,
        sort: s.sort,
      }),
    },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/store.ts
git commit -m "feat(dashboard): add filtersOpen UI state to store

Adds boolean drawer state + setter for mobile filter drawer. Excludes
filtersOpen from persistence via partialize so drawer doesn't restore
on refresh. Persistence version unchanged (no migration needed)."
```

---

## Task 2: Refactor `FilterSidebar` into `FilterPanel` + responsive shell

**Files:**
- Modify: `apps/dashboard/components/FilterSidebar.tsx`

Goal: keep the existing checkbox UI as a shared inner component `FilterPanel`. Wrap it in two layouts — inline `<aside>` for `≥lg`, drawer for `<lg`.

- [ ] **Step 1: Replace `FilterSidebar.tsx` contents**

Open `apps/dashboard/components/FilterSidebar.tsx` and replace the entire file with:

```typescript
'use client';
import { useEffect, useRef } from 'react';
import { SEVERITIES, ECOSYSTEMS, type Ecosystem, type Severity } from '@sec/shared';
import { useStore } from '../lib/store';

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function FilterSidebar() {
  const open = useStore((s) => s.filtersOpen);
  const setOpen = useStore((s) => s.setFiltersOpen);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Body scroll lock while drawer is open
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, [open]);

  // Esc-to-close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Move focus to Close button when drawer opens
  useEffect(() => {
    if (open) closeBtnRef.current?.focus();
  }, [open]);

  return (
    <>
      {/* Inline aside on lg+ */}
      <aside className="hidden lg:block w-56 shrink-0 border-r border-zinc-800 p-4">
        <FilterPanel />
      </aside>

      {/* Drawer + backdrop on <lg */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[var(--color-bg)] border-r border-zinc-800 p-4 overflow-y-auto"
            role="dialog"
            aria-label="Filters"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Filters</h2>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-zinc-700 px-3 py-2 text-sm min-h-[36px] text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
              >
                Close
              </button>
            </div>
            <FilterPanel />
          </aside>
        </div>
      )}
    </>
  );
}

function FilterPanel() {
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const reset = useStore((s) => s.reset);

  return (
    <>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Severity
      </h3>
      <ul className="mb-4 space-y-1">
        {SEVERITIES.map((s) => (
          <li key={s}>
            <label className="flex cursor-pointer items-center gap-2 text-sm py-1">
              <input
                type="checkbox"
                checked={filters.severities.includes(s)}
                onChange={() =>
                  setFilters({ severities: toggle(filters.severities, s as Severity) })
                }
              />
              <span className="capitalize">{s}</span>
            </label>
          </li>
        ))}
      </ul>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Ecosystem
      </h3>
      <ul className="mb-4 space-y-1">
        {ECOSYSTEMS.map((e) => (
          <li key={e}>
            <label className="flex cursor-pointer items-center gap-2 text-sm py-1">
              <input
                type="checkbox"
                checked={filters.ecosystems.includes(e)}
                onChange={() =>
                  setFilters({ ecosystems: toggle(filters.ecosystems, e as Ecosystem) })
                }
              />
              <span>{e}</span>
            </label>
          </li>
        ))}
      </ul>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Display
      </h3>
      <ul className="space-y-1 text-sm">
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={filters.stackMatchOnly}
              onChange={(e) => setFilters({ stackMatchOnly: e.target.checked })}
            />
            <span>Stack match only</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={filters.kevOnly}
              onChange={(e) => setFilters({ kevOnly: e.target.checked })}
            />
            <span>KEV only (actively exploited)</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={filters.hideRead}
              onChange={(e) => setFilters({ hideRead: e.target.checked })}
            />
            <span>Hide read</span>
          </label>
        </li>
        <li>
          <label className="flex cursor-pointer items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={filters.showDismissed}
              onChange={(e) => setFilters({ showDismissed: e.target.checked })}
            />
            <span>Show dismissed</span>
          </label>
        </li>
      </ul>

      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded border border-zinc-700 px-3 py-2 text-xs min-h-[36px] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      >
        Reset
      </button>
    </>
  );
}
```

Notes on what changed beyond the spec sections 5.1 baseline:
- Added `py-1` to each checkbox label so the click target spans more than just the text — implicit tap-target enlargement for filter rows themselves.
- Reset button bumped to `px-3 py-2 min-h-[36px]` (was `px-2 py-1`) for tap-target consistency.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 4: Visual smoke test**

Start dev server:
```bash
pnpm dev
```

Open `http://localhost:3000`. The page should render with the filter sidebar visible on the left at desktop width. **Do not close the dev server yet — leave it running for subsequent tasks.**

Then open Chrome DevTools → Toggle device toolbar (Ctrl+Shift+M) → iPhone 13 (390 × 844).
- Expected: the sidebar is now hidden. The page renders with full-width content list. There is no filter UI visible. (The trigger button comes in Task 3.)

Resize back to ≥1024 px width. Sidebar reappears.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/FilterSidebar.tsx
git commit -m "refactor(dashboard): split FilterSidebar into Panel + responsive shell

Extracts the filter checkbox UI into FilterPanel, wraps it in an inline
aside (>=lg) and a drawer (<lg) that listens to filtersOpen state.
Drawer adds backdrop, Esc handler, focus-on-open, and body scroll lock.
Trigger button comes in the next task."
```

---

## Task 3: Add sticky header with mobile filters trigger

**Files:**
- Modify: `apps/dashboard/app/layout.tsx`

- [ ] **Step 1: Create a new client component for the filters trigger**

The header in `layout.tsx` is a server component. Since the trigger needs `useStore`, it has to be a client component. Create a small client component file.

Create `apps/dashboard/components/FiltersTrigger.tsx`:

```typescript
'use client';
import { useStore } from '../lib/store';

export function FiltersTrigger() {
  const setOpen = useStore((s) => s.setFiltersOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="lg:hidden rounded border border-zinc-700 px-3 py-2 text-sm min-h-[36px] text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
    >
      Filters
    </button>
  );
}
```

- [ ] **Step 2: Update `layout.tsx`**

Open `apps/dashboard/app/layout.tsx`. Add the import after the existing imports:

```typescript
import { FiltersTrigger } from '../components/FiltersTrigger';
```

Replace the `<header>` block. Current:
```tsx
        <header className="border-b border-zinc-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/" className="font-semibold text-[var(--color-fg)]">
              security-scraper
            </Link>
            <nav className="flex gap-2">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded px-2 py-1 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto">
              <LastUpdated lastRun={lastRun} />
            </div>
          </div>
        </header>
```

Replace with:
```tsx
        <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[var(--color-bg)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="font-semibold text-[var(--color-fg)]">
              security-scraper
            </Link>
            <nav className="flex flex-wrap gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded px-3 py-2 text-sm min-h-[36px] flex items-center text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)] md:px-2 md:py-1 md:min-h-0"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <FiltersTrigger />
            <div className="ml-auto">
              <LastUpdated lastRun={lastRun} />
            </div>
          </div>
        </header>
```

Changes:
- `sticky top-0 z-30 bg-[var(--color-bg)]` — header stays put on scroll. `z-30` keeps it below the drawer's `z-40`.
- Nav links: `px-3 py-2 min-h-[36px] flex items-center` on mobile, `md:px-2 md:py-1 md:min-h-0` reverts at `md+` to preserve desktop density.
- `<FiltersTrigger />` placed inline; it self-hides via `lg:hidden` on desktop.
- Gap reduced from `gap-4` to `gap-3` to leave room for the extra trigger button.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 5: Visual smoke test**

With dev server still running from previous task (restart if not: `pnpm dev`).

At 390 px width:
- Header shows "security-scraper" + nav + "Filters" button (wrapped onto two lines if narrow).
- Tap "Filters" button → drawer slides in from left, backdrop appears, focus jumps to Close button.
- Tap backdrop → drawer closes. Press Esc inside drawer → drawer closes.
- Scroll down 1000 px → header remains visible at the top.

At ≥1024 px width:
- "Filters" trigger button is hidden.
- Inline sidebar is visible (as before).
- Header is sticky on scroll.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/components/FiltersTrigger.tsx apps/dashboard/app/layout.tsx
git commit -m "feat(dashboard): sticky header + mobile Filters trigger

Header becomes sticky top-0 z-30 so the new mobile Filters trigger
button stays reachable while scrolling. Nav links get 36px tap targets
on mobile via min-h-[36px], reverting to compact desktop density at md+."
```

---

## Task 4: Update `VulnRow` for mobile (actions, title, metadata, tap targets)

**Files:**
- Modify: `apps/dashboard/components/VulnRow.tsx`

- [ ] **Step 1: Replace `VulnRow.tsx`**

Open `apps/dashboard/components/VulnRow.tsx` and replace its entire contents:

```typescript
'use client';
import Link from 'next/link';
import type { Vuln } from '@sec/shared';
import { useStore } from '../lib/store';
import { PriorityBadge } from './PriorityBadge';
import { SeverityPill } from './SeverityPill';
import { StackMatchChips } from './StackMatchChips';

function relativeAge(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diffH = (Date.now() - t) / 3_600_000;
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}m`;
  if (diffH < 24) return `${Math.round(diffH)}h`;
  return `${Math.round(diffH / 24)}d`;
}

export function VulnRow({ vuln }: { vuln: Vuln }) {
  const readIds = useStore((s) => s.readIds);
  const markRead = useStore((s) => s.markRead);
  const unmarkRead = useStore((s) => s.unmarkRead);
  const dismiss = useStore((s) => s.dismiss);
  const read = readIds.includes(vuln.id);

  return (
    <div
      className={`group flex flex-col gap-3 border-b border-zinc-800 px-4 py-3 transition-colors hover:bg-[var(--color-surface)] sm:flex-row sm:items-start sm:gap-4 ${
        read ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0 sm:gap-4">
        <PriorityBadge priority={vuln.priority} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
            <SeverityPill severity={vuln.severity} />
            {vuln.kev && (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-red-300">
                KEV
              </span>
            )}
            <span className="font-mono text-[11px]">{vuln.cveId ?? vuln.ghsaId ?? vuln.id}</span>
            <span className="text-[11px]">· {relativeAge(vuln.publishedAt)}</span>
          </div>
          <Link
            href={`/vuln/${encodeURIComponent(vuln.id)}/`}
            className="mt-0.5 block text-[15px] font-medium text-[var(--color-fg)] hover:text-[var(--color-accent)] line-clamp-2 md:truncate"
            title={vuln.title}
          >
            {vuln.title}
          </Link>
          <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
            <StackMatchChips match={vuln.stackMatch} />
            <span className="text-[11px] text-[var(--color-muted)] truncate max-w-full">
              {vuln.sources.map((s) => s.source).join(', ')}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto sm:shrink-0 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
        <button
          onClick={() => (read ? unmarkRead(vuln.id) : markRead(vuln.id))}
          className="rounded border border-zinc-700 px-3 py-2 text-xs min-h-[36px] text-[var(--color-muted)] hover:text-[var(--color-fg)] md:px-2 md:py-1 md:min-h-0"
          type="button"
        >
          {read ? 'unread' : 'read'}
        </button>
        <button
          onClick={() => dismiss(vuln.id)}
          className="rounded border border-zinc-700 px-3 py-2 text-xs min-h-[36px] text-[var(--color-muted)] hover:text-[var(--color-fg)] md:px-2 md:py-1 md:min-h-0"
          type="button"
        >
          dismiss
        </button>
      </div>
    </div>
  );
}
```

Changes vs. baseline:
- Outer container: `flex flex-col gap-3 ... sm:flex-row sm:items-start sm:gap-4`. On `<sm` row stacks vertically; on `≥sm` it's horizontal as before.
- Action buttons block: `md:opacity-0 md:transition-opacity md:group-hover:opacity-100` (was `opacity-0 transition-opacity group-hover:opacity-100`). Always visible on `<md`, hover-revealed on `≥md`.
- Action buttons placement: `self-end sm:self-auto sm:shrink-0` — bottom-right on phones, inline-right on `≥sm`.
- Title: `line-clamp-2 md:truncate` (was just `truncate`). 2-line clamp on `<md`, single-line truncate on `≥md`.
- Metadata row (chips + sources): `flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3` — stacks on `<sm`.
- Sources span gets `truncate max-w-full` so a long source list doesn't blow out the row width.
- Action button padding: `px-3 py-2 min-h-[36px] md:px-2 md:py-1 md:min-h-0`.
- Header metadata `flex` becomes `flex flex-wrap` so SeverityPill + KEV badge + CVE id + age wrap cleanly on narrow screens.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 4: Visual smoke test**

Dev server should still be running.

At 390 px:
- Vuln rows are visible without hover for read/dismiss buttons.
- Title wraps to ≤2 lines.
- Each row reads top-to-bottom: PriorityBadge + content stack, then action buttons bottom-right.
- Tap a read button — it visually triggers (row goes 60% opacity).

At 768 px:
- Title still wraps to 2 lines (md breakpoint is 768 — should now switch to truncate). Verify by reading the actual class: `md:truncate` kicks in at exactly 768 px.

At 1280 px:
- Layout looks like before this change. Actions are hover-gated again. Title truncates.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/VulnRow.tsx
git commit -m "feat(dashboard): VulnRow mobile usability

Stack row vertically on <sm; show actions always on touch (<md), gate
behind hover on >=md; clamp title to 2 lines on <md; stack chips+sources
on <sm; bump action button tap targets to 36px on mobile."
```

---

## Task 5: Update `SortSelect` tap target

**Files:**
- Modify: `apps/dashboard/components/SortSelect.tsx`

- [ ] **Step 1: Update the select element classes**

Open `apps/dashboard/components/SortSelect.tsx`. Find the `<select>` className and replace it. Current:

```typescript
        className="rounded border border-zinc-700 bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none"
```

Replace with:

```typescript
        className="rounded border border-zinc-700 bg-[var(--color-surface)] px-3 py-2 text-sm min-h-[36px] text-[var(--color-fg)] focus:border-[var(--color-accent)] focus:outline-none md:px-2 md:py-1 md:min-h-0"
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Visual smoke test**

At 390 px the Sort dropdown is touch-friendly (~36 px tall). At 1280 px it reverts to compact.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/SortSelect.tsx
git commit -m "feat(dashboard): bump SortSelect tap target on mobile

36px min-height on <md, reverts to compact at md+."
```

---

## Task 6: Update `AlertLog` toggle tap target

**Files:**
- Modify: `apps/dashboard/components/AlertLog.tsx`

- [ ] **Step 1: Update the toggle button classes**

Open `apps/dashboard/components/AlertLog.tsx`. Find the toggle button. Current:

```typescript
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="text-xs uppercase tracking-wide text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      >
```

Replace with:

```typescript
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="text-xs uppercase tracking-wide text-[var(--color-muted)] hover:text-[var(--color-fg)] min-h-[36px] flex items-center md:min-h-0"
      >
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Visual smoke test**

At 390 px the AlertLog toggle button is taller (36 px). At 1280 px it's compact again.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/AlertLog.tsx
git commit -m "feat(dashboard): bump AlertLog toggle tap target on mobile"
```

---

## Task 7: `SourceHealth` mobile collapse

**Files:**
- Modify: `apps/dashboard/components/SourceHealth.tsx`

- [ ] **Step 1: Replace `SourceHealth.tsx` contents**

Open `apps/dashboard/components/SourceHealth.tsx` and replace its entire contents with:

```typescript
'use client';
import { useState } from 'react';
import type { SourcesFile } from '@sec/shared';

const COLOR: Record<string, string> = {
  closed: 'bg-emerald-500',
  'half-open': 'bg-yellow-400',
  open: 'bg-red-500',
};

export function SourceHealth({ sources }: { sources: SourcesFile }) {
  const entries = Object.entries(sources);
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;
  const healthy = entries.filter(([, h]) => h.state === 'closed').length;

  return (
    <footer className="border-t border-zinc-800 px-4 py-2">
      {/* Mobile: collapsed summary */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          className="text-xs uppercase tracking-wide text-[var(--color-muted)] min-h-[36px] flex items-center gap-2 hover:text-[var(--color-fg)]"
        >
          Source health: {healthy}/{entries.length} healthy {open ? '▾' : '▸'}
        </button>
        {open && (
          <ul className="mt-2 flex flex-col gap-1">
            {entries.map(([id, h]) => (
              <li key={id} className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <span className={`h-2 w-2 rounded-full ${COLOR[h.state] ?? 'bg-zinc-500'}`} />
                <span>{id}</span>
                {h.lastError && <span className="opacity-70">— {h.lastError}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Desktop: full inline layout */}
      <div className="hidden md:flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
          Source health
        </span>
        {entries.map(([id, h]) => (
          <span
            key={id}
            title={h.lastError ? `${id}: ${h.lastError}` : `${id}: ${h.state}`}
            className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]"
          >
            <span className={`h-2 w-2 rounded-full ${COLOR[h.state] ?? 'bg-zinc-500'}`} />
            {id}
          </span>
        ))}
      </div>
    </footer>
  );
}
```

Changes:
- Added `'use client'` directive — required because the mobile collapse uses `useState`.
- Mobile path (`md:hidden`): summary button + collapsed list of all sources with state dot, id, and lastError if present.
- Desktop path (`hidden md:flex`): exact same layout as before.

- [ ] **Step 2: Verify the parent passes plain data**

`SourceHealth` was a server component previously. Its parent is `layout.tsx` which is a server component reading `data/sources.json` via `loadSourceHealth()`. The `SourcesFile` type is a plain JSON object, no functions. So passing it from a server component to a now-client component works without any serialization issue.

No change needed in `layout.tsx`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: no errors

- [ ] **Step 5: Visual smoke test**

At 390 px:
- Footer shows "Source health: N/N healthy ▸" instead of the dot wall.
- Tap → list expands below, one source per line with dot + id + error message if any. Toggle caret becomes "▾".

At 1280 px:
- Footer shows the original horizontal dot list as before.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/components/SourceHealth.tsx
git commit -m "feat(dashboard): collapsible SourceHealth on mobile

<md viewports show 'N/M healthy' summary that toggles a vertical list.
>=md unchanged. Converts component to client (needed for useState)."
```

---

## Task 8: Full mobile pass — manual verification

No code changes in this task. Verify the spec's acceptance criteria (section 10) end-to-end.

- [ ] **Step 1: Restart dev server**

If the dev server has been running through the previous tasks, stop it (Ctrl+C) and restart:
```bash
pnpm dev
```

- [ ] **Step 2: Verify at 390 × 844 (iPhone 13)**

Open `http://localhost:3000`. Chrome DevTools → device mode → iPhone 13.

Acceptance criteria checks:
- AC #1 — Filters reachable: Tap "Filters" in header → drawer opens with all checkboxes. ✓
- AC #2 — Row actions visible: Each VulnRow shows `read`/`dismiss` buttons without hover. ✓
- AC #3 — Tap targets ≥ 36 px: Use DevTools → Elements → hover over Filters button → check computed height. ≥ 36. ✓
- AC #4 — Title wraps 2 lines: Find a long-title vuln. Title shows on 2 lines, not truncated. ✓
- AC #5 — Sticky header: Scroll down 1000+ px. Header stays visible. ✓
- AC #7 — Source health: Footer shows summary, not the dot wall. ✓

- [ ] **Step 3: Verify at 768 × 1024 (iPad portrait)**

Resize to 768 × 1024.
- Drawer is still drawer (we said `<lg` = drawer, and 768 < 1024). Filters button still visible.
- Title switches to single-line truncate (md breakpoint).
- Actions still always-visible (md = touch threshold).

- [ ] **Step 4: Verify at 1024 × 1366 (small laptop)**

Resize to 1024 px wide.
- Filters trigger button **hidden**. Inline sidebar **visible**.
- Actions hover-gated. Hover a row → buttons fade in.

- [ ] **Step 5: Verify at 1440 × 900 (laptop)**

Resize to 1440 × 900.
- AC #8 — Desktop layout unchanged: should look like the pre-change build. Spot-check by comparing to a git stash or screenshot if available. ✓

- [ ] **Step 6: Stop dev server**

Ctrl+C in the terminal running `pnpm dev`.

- [ ] **Step 7: No commit unless an issue was found**

If a fix was needed during verification, commit it with `fix(dashboard): <description>`. Otherwise this task produces no commit.

---

## Done

All spec changes implemented. Verify with:

```bash
git log --oneline -10
```

You should see ~7 commits from this plan (1 store + 1 sidebar + 1 layout/trigger + 1 vulnrow + 1 sortselect + 1 alertlog + 1 sourcehealth).
