# Dashboard Mobile Usability — Design Specification

**Date:** 2026-05-22
**Status:** Draft (pending user review)
**Author:** brainstorming session
**Scope:** `apps/dashboard/` only — no changes to scraper, schemas, or data layer

---

## 1. Purpose

Make the dashboard usable on phones (≤640 px) and small tablets (640–1024 px). The current build is desktop-only in two respects: filters are unreachable below 1024 px, and per-row actions are gated behind hover, which doesn't exist on touch devices. Both are blockers, not polish — the dashboard is effectively read-only on a phone right now.

The brief: "a bit more usable" — focused fixes, not a redesign. Same visual language, same component set, additive layout rules.

## 2. Goals & Non-Goals

### Goals

1. Filters reachable on every screen size.
2. Row actions (read / unread / dismiss) reachable on touch devices.
3. Tap targets meet a 36 px minimum on touch.
4. Titles legible — no single-line truncation on phones.
5. Header remains reachable while scrolling on mobile.
6. Source-health footer doesn't dominate the viewport on phones.

### Non-Goals

- No theme toggle (dark mode stays default).
- No animation framework, no Framer Motion. CSS transitions only.
- No icon library. Existing emoji / text labels stay.
- No new dependencies.
- No changes to `/vuln/[id]` detail page (already simple enough).
- No changes to data model, schemas, scraper, or notifications.
- No mobile-specific dark/light handling.

## 3. Current State Audit

| Component | Mobile failure | Severity |
|---|---|---|
| `FilterSidebar` | `hidden ... lg:block` — completely invisible on `<1024 px`. No alternative entry point. Severity, ecosystem, KEV-only, stack-match-only, hide-read filters all unreachable. | **P0** |
| `VulnRow` actions | `opacity-0 group-hover:opacity-100` — read/unread/dismiss buttons require a mouse hover. Touch devices have no equivalent. | **P0** |
| `VulnRow` tap targets | `px-2 py-1 text-xs` ≈ 24 px tall — below the 36 px minimum. | P1 |
| `VulnRow` title | `truncate` — single-line clip drops content on narrow viewports. | P1 |
| `layout.tsx` header | Not sticky — scrolls away, so the (future) filters button would also scroll away. | P1 |
| `SourceHealth` footer | 25 source dots in `flex-wrap` produce ~5 rows on a phone, dominating the viewport. | P2 |
| `VulnRow` metadata row | Stack chips + source list crowded into one row on narrow screens; sources wrap awkwardly. | P2 |
| `SortSelect`, `AlertLog` toggle | Buttons share the same too-small tap-target pattern. | P2 |

## 4. Changes Summary

| # | Change | Files | Priority |
|---|---|---|---|
| 1 | Filter drawer for `<lg`, inline aside for `≥lg` | `FilterSidebar.tsx`, `layout.tsx`, `lib/store.ts` | P0 |
| 2 | Row actions: always visible on touch, hover-revealed on `≥md` | `VulnRow.tsx` | P0 |
| 3 | Tap targets: 36 px minimum on touch | `VulnRow.tsx`, `SortSelect.tsx`, `AlertLog.tsx`, nav links in `layout.tsx` | P1 |
| 4 | Title wraps 2 lines on `<md`, truncates on `≥md` | `VulnRow.tsx` | P1 |
| 5 | Sticky header on mobile | `layout.tsx` | P1 |
| 6 | `VulnRow` metadata stacks on `<sm` | `VulnRow.tsx` | P2 |
| 7 | `SourceHealth` collapsible summary on `<md` | `SourceHealth.tsx` | P2 |

Net new dependencies: **0**.

Net new components: **0**. Drawer is `FilterSidebar` with a responsive variant.

## 5. Per-Change Design

### 5.1 Filter drawer (P0)

**State:** add to `apps/dashboard/lib/store.ts`:

```typescript
interface State {
  // ...existing fields
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
}
```

`filtersOpen` is **not** persisted to localStorage — it's pure UI state, defaulting to `false` on every page load. Exclude from the zustand `persist` middleware partializer if one is added; current `persist` config takes the whole state, so we'll add a partialize function to exclude `filtersOpen`. Bump `version` to `3` and add a migration that drops `filtersOpen` if found in any old persisted state.

**Trigger button:** in `apps/dashboard/app/layout.tsx` header, add a button visible only on `<lg`:

```tsx
<button
  type="button"
  onClick={() => setFiltersOpen(true)}
  className="lg:hidden rounded border border-zinc-700 px-3 py-2 text-sm text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
>
  Filters
</button>
```

Placed alongside the nav. The `lg:hidden` class hides it on desktop where the inline sidebar is visible.

**Drawer variant:** in `apps/dashboard/components/FilterSidebar.tsx`, the current `<aside className="hidden ... lg:block">` becomes two variants in one component:

```tsx
export function FilterSidebar() {
  const open = useStore((s) => s.filtersOpen);
  const setOpen = useStore((s) => s.setFiltersOpen);
  // ...existing filter / setFilter / reset hooks

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
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-zinc-700 px-3 py-2 text-sm"
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

function FilterPanel() { /* existing JSX moved here verbatim */ }
```

The interior `FilterPanel` keeps the existing severity / ecosystem / display checkboxes + Reset button unchanged. Both desktop aside and mobile drawer share it.

**Body scroll lock:** when `filtersOpen` is `true`, add `overflow-hidden` to `<body>` via a tiny effect inside `FilterSidebar.tsx`:

```tsx
useEffect(() => {
  if (!open) return;
  document.body.classList.add('overflow-hidden');
  return () => document.body.classList.remove('overflow-hidden');
}, [open]);
```

**Esc-to-close:**

```tsx
useEffect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [open, setOpen]);
```

**Auto-close behaviour:** filter selections do **not** auto-close the drawer. Users adjust multiple checkboxes in sequence; auto-close would force re-opening. The drawer closes only via: backdrop tap, Close button, or Esc key.

### 5.2 Row actions on touch (P0)

Current `VulnRow.tsx` action container:

```tsx
<div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
```

Becomes:

```tsx
<div className="flex shrink-0 items-center gap-2 md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
```

On `<md`, actions are always visible. On `≥md`, current hover-reveal behaviour is preserved.

The action buttons themselves move from inline-end to a row-below position on `<sm` to avoid competing with the title for horizontal space. The row layout becomes:

```tsx
<div className="group flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4 border-b border-zinc-800 px-4 py-3 ...">
  <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
    <PriorityBadge ... />
    <div className="flex-1 min-w-0">{/* metadata + title + chips */}</div>
  </div>
  <div className="flex items-center gap-2 self-end sm:self-auto md:opacity-0 md:group-hover:opacity-100">
    {/* read/dismiss buttons */}
  </div>
</div>
```

On `<sm` the action buttons appear bottom-right of the row. On `≥sm` they sit inline-right as today.

### 5.3 Tap targets (P1)

Affected buttons / interactive elements get `min-h-[36px]` plus increased padding on mobile:

| Component | Before | After |
|---|---|---|
| `VulnRow` action buttons | `px-2 py-1 text-xs` | `px-3 py-2 text-xs min-h-[36px] md:min-h-0 md:px-2 md:py-1` |
| `SortSelect` `<select>` | `px-2 py-1` | `px-3 py-2 min-h-[36px] md:min-h-0 md:px-2 md:py-1` |
| `AlertLog` toggle | `text-xs` button | wrapper gets `min-h-[36px] flex items-center md:min-h-0` |
| Nav links (`layout.tsx`) | `px-2 py-1` | `px-3 py-2 md:px-2 md:py-1` |
| Filter trigger button | new — `px-3 py-2 min-h-[36px]` | n/a |

Reset button inside the filter panel: same `min-h-[36px] md:min-h-0` treatment.

### 5.4 Title line-clamp (P1)

`VulnRow.tsx`:

```tsx
<Link
  href={...}
  className="mt-0.5 block text-[15px] font-medium ... line-clamp-2 md:truncate"
  title={vuln.title}
>
  {vuln.title}
</Link>
```

`line-clamp-2` is a Tailwind v4 built-in (no plugin). On `≥md`, `md:truncate` overrides to single-line clip.

### 5.5 Sticky header (P1)

`layout.tsx` header:

```tsx
<header className="sticky top-0 z-30 border-b border-zinc-800 bg-[var(--color-bg)] px-4 py-3">
```

`z-30` sits below the filter drawer's `z-40` (drawer must overlay the header). Header height stays unchanged.

### 5.6 Metadata row stacks on narrow (P2)

In `VulnRow.tsx`, the row currently containing `<StackMatchChips>` + sources:

```tsx
<div className="mt-1 flex items-center gap-3">
  <StackMatchChips match={vuln.stackMatch} />
  <span className="text-[11px] text-[var(--color-muted)]">
    {vuln.sources.map((s) => s.source).join(', ')}
  </span>
</div>
```

Becomes:

```tsx
<div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
  <StackMatchChips match={vuln.stackMatch} />
  <span className="text-[11px] text-[var(--color-muted)] truncate max-w-full">
    {vuln.sources.map((s) => s.source).join(', ')}
  </span>
</div>
```

`max-w-full + truncate` on the sources line ensures it doesn't blow out the row width when many sources are merged.

### 5.7 `SourceHealth` collapsible summary on `<md` (P2)

`apps/dashboard/components/SourceHealth.tsx` gets a small client component for the mobile collapse:

```tsx
'use client';
import { useState } from 'react';

export function SourceHealth({ sources }: { sources: SourcesFile }) {
  const entries = Object.entries(sources);
  if (entries.length === 0) return null;
  const healthy = entries.filter(([, h]) => h.state === 'closed').length;
  const [open, setOpen] = useState(false);

  return (
    <footer className="border-t border-zinc-800 px-4 py-2">
      {/* Mobile: summary + toggle */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((x) => !x)}
          className="text-xs uppercase tracking-wide text-[var(--color-muted)] min-h-[36px] flex items-center gap-2"
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

      {/* Desktop: existing inline layout */}
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

`'use client'` directive is required because the mobile collapse uses `useState`. The component was previously a server component; converting to client adds zero data dependencies (props are pure JSON-serialisable).

## 6. Responsive Breakpoints (Tailwind defaults)

| Breakpoint | Width | Behaviour |
|---|---|---|
| (default, `<sm`) | < 640 px | Drawer filters, stacked metadata, actions at row-bottom, line-clamp-2 title, sticky header, collapsed source health |
| `sm` | ≥ 640 px | Actions inline-right of row, metadata inline |
| `md` | ≥ 768 px | Source health full footer, title truncates, actions hover-revealed, smaller tap targets |
| `lg` | ≥ 1024 px | Inline filter sidebar replaces drawer; Filters trigger button hidden |
| `xl` | ≥ 1280 px | (no changes — desktop layout stable from here) |

No custom breakpoints needed.

## 7. Accessibility

- Drawer uses `role="dialog"` + `aria-label="Filters"`.
- Esc-to-close keyboard support.
- Filter trigger button has visible `Filters` text label.
- Focus management: when drawer opens, move focus to the Close button; when it closes, return focus to the trigger button. Implement with a `useRef` on each + an `useEffect` on `open`.
- Source-health toggle and AlertLog toggle: native `<button>` elements with text labels (already correct).
- Color contrast: existing OKLCH palette unchanged; contrast already validated for desktop, no mobile-specific issues.

## 8. Testing

| Test | How |
|---|---|
| Drawer opens / closes / Esc | Playwright spec (extend existing dashboard smoke test) |
| Drawer backdrop tap closes | Playwright |
| Filter checkbox changes don't auto-close drawer | Playwright |
| Row actions visible without hover on touch viewport | Playwright with `viewport: { width: 390, height: 844 }` + `hasTouch: true` |
| Tap targets ≥ 36 px | Playwright: assert `boundingBox().height >= 36` for sample buttons at mobile viewport |
| Title line-clamp at narrow vs. truncate at wide | Playwright snapshot at 390 px and 1280 px |
| Sticky header stays in view on scroll | Playwright `page.evaluate(() => window.scrollTo(0, 2000))` then assert header still visible |
| `SourceHealth` collapsed by default on mobile | Playwright |

Existing component-level tests (Vitest + RTL) get one new test per touched component asserting the new class string or rendered output. No new test infrastructure.

Manual verification at 390 px (iPhone 13), 768 px (iPad portrait), 1024 px (iPad landscape), 1440 px (laptop). Done via `pnpm dev` + browser devtools.

## 9. Implementation Order

1. `lib/store.ts` — add `filtersOpen` + setter; partialize to exclude from persisted state; bump version to 3.
2. `layout.tsx` — sticky header, Filters trigger button, nav link tap-target tweaks.
3. `components/FilterSidebar.tsx` — extract `FilterPanel`, wrap in dual aside/drawer, body scroll lock, Esc handler, focus management.
4. `components/VulnRow.tsx` — actions visibility, title line-clamp, metadata stacking, tap targets.
5. `components/SortSelect.tsx` + `components/AlertLog.tsx` — tap target tweaks.
6. `components/SourceHealth.tsx` — convert to client component, mobile collapse summary.
7. Smoke-test at 390 / 768 / 1024 / 1440 px via `pnpm dev`.
8. Playwright spec updates.

Sequential commits, one per file or logical group, so any single change can be reverted independently.

## 10. Acceptance Criteria

1. At 390 px viewport, every filter accessible via a drawer reachable from a header button.
2. At 390 px viewport, every `VulnRow` shows read/dismiss buttons without hover.
3. At 390 px viewport, no button or interactive control has rendered height < 36 px (measured via Playwright).
4. At 390 px viewport, vuln titles display up to 2 lines without horizontal overflow.
5. At 390 px viewport, header remains visible at `window.scrollY = 2000`.
6. At ≥ 1024 px viewport, the filter trigger button is not visible; the inline sidebar is.
7. At ≥ 768 px viewport, `SourceHealth` shows the full inline dot list as today.
8. Existing desktop layout at ≥ 1280 px is visually unchanged from the current build (verified by Playwright screenshot comparison).
9. No new npm dependencies introduced.

## 11. Open Questions / Out of Scope

- **Theme toggle.** Deferred. Current dark default is fine.
- **Pull-to-refresh / virtual scrolling.** With 10 k rows, performance on phones may degrade. Defer until measured — current render is plain React mapping; if scroll lag appears on real devices, add `react-window` later.
- **Per-row swipe actions** (swipe-to-dismiss). Deferred — explicit buttons cover the same intent without gesture ambiguity.
- **Mobile-specific keyboard shortcuts.** Not applicable.
- **`/vuln/[id]` detail page mobile review.** Out of scope per Section 2; revisit after this lands if users find it lacking.
