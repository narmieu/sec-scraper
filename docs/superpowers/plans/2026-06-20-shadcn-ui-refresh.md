# shadcn UI Refresh + Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Visual-restyle steps should apply frontend-design judgment (hierarchy, spacing, consistency) — they are not verbatim transcriptions.

**Goal:** Rebuild every dashboard surface on shadcn/ui primitives + Tabler icons (Polish refresh, dark identity preserved), and replace the `/vuln/[id]` page with a responsive, URL-synced preview modal that lazy-loads per-vuln detail shards.

**Architecture:** shadcn init (Tailwind v4) with the existing OKLCH palette mapped onto shadcn tokens. A cva Badge consolidates the colored spans. The Phase-0 generator also emits per-vuln detail shards; a responsive Dialog/Drawer modal (`?v=<id>`) fetches them. All client-side, static-export-safe.

**Tech Stack:** Next 16 static export, React 19, Tailwind v4 (CSS-first), shadcn/ui, `@tabler/icons-react`, cva/clsx/tailwind-merge, vaul (Drawer). Network required for `shadcn add` + installs.

## Global Constraints

- **DO NOT COMMIT and DO NOT `git add`.** Leave everything unstaged on `main`.
- Dark-only. Preserve the existing visual identity (zinc surfaces, blue accent, severity colors) — restyle, don't redesign.
- Reference shadcn/custom tokens only inside components (no ad-hoc hex/oklch). Centralize variants in cva; use `cn()` for conditionals.
- App-facing icons are **Tabler** (`@tabler/icons-react`). shadcn primitives keep their default internal icons (lucide, pulled in transitively by `shadcn add`) — acceptable; do not hand-swap them.
- Preserve ALL behavior: filters, sort, search, pagination, affected-only, read/dismiss, mobile filter drawer, exposure badges.
- Static export: every interactive piece is a client component; the modal uses a `?v=` search param (no server routing).
- Gate (no dashboard unit runner): `pnpm --filter @sec/dashboard typecheck` + `pnpm lint` per task; `pnpm --filter @sec/dashboard build` + a `pnpm dev` visual pass at the end.
- Diff isolation scope: `apps packages pnpm-lock.yaml`.

---

## Task A — Foundation (shadcn init, tokens, deps)

**Files:** create `apps/dashboard/lib/utils.ts`, `apps/dashboard/components.json`; rewrite `apps/dashboard/app/globals.css`; add `components/ui/*` via CLI; modify `apps/dashboard/package.json` (deps).

- [ ] **Step 1: Install base deps**

Run: `pnpm --filter @sec/dashboard add class-variance-authority clsx tailwind-merge @tabler/icons-react && pnpm --filter @sec/dashboard add -D tw-animate-css`
Expected: installs succeed (network).

- [ ] **Step 2: Create `lib/utils.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Create `apps/dashboard/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

- [ ] **Step 4: Rewrite `app/globals.css` with the token mapping**

Replace the file with (preserves custom severity tokens + scrollbar utilities; maps the palette onto shadcn tokens):

```css
@import 'tailwindcss';
@import 'tw-animate-css';

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  /* preserved severity/exposure tokens */
  --color-critical: var(--critical);
  --color-high: var(--high);
  --color-medium: var(--medium);
  --color-low: var(--low);
  --color-unknown: var(--unknown);
}

:root {
  --radius: 0.5rem;
  --background: oklch(0.15 0 0);
  --foreground: oklch(0.95 0 0);
  --card: oklch(0.21 0 0);
  --card-foreground: oklch(0.95 0 0);
  --popover: oklch(0.21 0 0);
  --popover-foreground: oklch(0.95 0 0);
  --primary: oklch(0.72 0.18 250);
  --primary-foreground: oklch(0.98 0 0);
  --secondary: oklch(0.27 0 0);
  --secondary-foreground: oklch(0.95 0 0);
  --muted: oklch(0.27 0 0);
  --muted-foreground: oklch(0.65 0 0);
  --accent: oklch(0.27 0 0);
  --accent-foreground: oklch(0.95 0 0);
  --destructive: oklch(0.65 0.21 25);
  --border: oklch(0.30 0 0);
  --input: oklch(0.30 0 0);
  --ring: oklch(0.72 0.18 250);
  --critical: oklch(0.65 0.21 25);
  --high: oklch(0.7 0.19 50);
  --medium: oklch(0.8 0.17 90);
  --low: oklch(0.65 0.03 240);
  --unknown: oklch(0.5 0 0);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
}

html, body { background-color: var(--background); color: var(--foreground); }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 14px; line-height: 1.5; min-height: 100vh;
}
::selection { background-color: oklch(0.72 0.18 250 / 0.35); }
```

Then re-append the existing `@utility scrollbar-slim`, `@utility scrollbar-fade`, and the base `*` scrollbar rules verbatim from the prior globals.css (lines 34–120 of the original) so custom scrollbars are preserved.

- [ ] **Step 5: Add shadcn primitives via CLI**

Run: `cd apps/dashboard && pnpm dlx shadcn@latest add button badge input select checkbox label card sheet dialog drawer tooltip skeleton separator dropdown-menu --yes`
Expected: writes `components/ui/*.tsx`, installs Radix + vaul deps. (If a component prompts, accept defaults.)

- [ ] **Step 6: Verify foundation**

Run: `pnpm --filter @sec/dashboard typecheck` (clean) and `pnpm --filter @sec/dashboard build` (exports — the ui components aren't used yet, so this confirms the token CSS + setup compile). Leave unstaged.

---

## Task B — Badge system + icons

**Files:** create `apps/dashboard/components/Badge.tsx` (or extend `components/ui/badge.tsx` variants); modify `SeverityPill.tsx`, `ExposureBadge.tsx`, `StackMatchChips.tsx`, `PriorityBadge.tsx`, and the inline KEV badge usages (`VulnRow.tsx` — KEV only, full row restyle is Task C).

**Interfaces:** Produces a cva `badgeVariants` covering: `severity-{critical,high,medium,low,unknown}`, `exposure-{affected,potential,safe}`, `kev`, `stack`. Each badge optionally renders a leading Tabler icon.

- [ ] **Step 1: cva badge variants**

Create `apps/dashboard/components/StatusBadge.tsx` using `cva` with the variants above, colored from the kept tokens (e.g. severity-critical → `bg-[var(--color-critical)]/15 text-[var(--color-critical)] border-[var(--color-critical)]/40`). Export a `StatusBadge` that takes `{ variant, icon?, children }` and renders `cn(badgeVariants({ variant }))` on a shadcn `Badge` (variant `outline`). Keep it small and token-driven.

- [ ] **Step 2: Migrate the badge components**
- `SeverityPill` → `<StatusBadge variant={`severity-${severity}`}>{severity}</StatusBadge>`.
- `ExposureBadge` → map status to `exposure-*` variant + Tabler icon (`IconAlertTriangle`/`IconHelpCircle`/`IconShieldCheck`); preserve `unknown`→null and `patch <fixedIn>` suffix.
- `StackMatchChips` → package chips as `StatusBadge variant="stack"`; keep reason·score muted label; keep `score===0 || packages empty → null`.
- `PriorityBadge` → keep its numeric/threshold logic; render via the box styles using tokens.
- KEV inline → `<StatusBadge variant="kev" icon={IconFlame}>KEV</StatusBadge>`.

- [ ] **Step 3: Verify**

`pnpm --filter @sec/dashboard typecheck` + `pnpm lint` clean. Visually the badges should match-or-improve the originals. Leave unstaged.

---

## Task C — List surface

**Files:** `components/VulnRow.tsx`, `SearchBar.tsx`, `SortSelect.tsx`, `ActiveFilters.tsx`, `Pagination.tsx`, and the skeleton in `VulnListView.tsx`.

Restyle on shadcn primitives + Tabler, preserving ALL Phase-0 behavior and the `IndexEntry` types:
- **VulnRow:** keep the layout and the store wiring (read/dismiss). Make the row an anchor `href={`?v=${encodeURIComponent(vuln.id)}`}` with `onClick` that, when no modifier key is held, calls `e.preventDefault()` and `window.history.pushState({}, '', `?v=${encodeURIComponent(vuln.id)}`)` then dispatches a `popstate`-like update (use a tiny shared helper `openVuln(id)` in `lib/useVulnParam.ts` from Task G — for THIS task, wire the anchor `href` and a click handler that calls a passed/imported `openVuln`; Task G provides `openVuln`). read/dismiss → icon `Button`s (`IconCheck`/`IconCircleDot`, `IconX`) with `Tooltip`. Age with `IconClock`, sources with `IconDatabase` or muted text. PriorityBadge/SeverityPill/ExposureBadge/StackMatchChips from Task B.
- **SearchBar:** shadcn `Input` + leading `IconSearch` (absolute-positioned), debounced as today; keep `setQuery` wiring.
- **SortSelect:** shadcn `Select` bound to the store `sort`; options from `SORT_OPTIONS`.
- **ActiveFilters:** removable `StatusBadge`/`Badge` chips with `IconX`; keep clear logic.
- **Pagination:** shadcn `Button` (variant outline/ghost) + `IconChevronLeft`/`IconChevronRight`; keep the Phase-0 props/logic.
- **Skeleton:** swap the hand-rolled skeleton to shadcn `Skeleton`.

- [ ] **Step 1: Implement the restyles** (apply frontend-design judgment; reference Task B badges + ui primitives).
- [ ] **Step 2: Verify** `pnpm --filter @sec/dashboard typecheck` + `pnpm lint` clean. Leave unstaged. (Row→modal is verified end-to-end in Task G.)

---

## Task D — FilterSidebar + source health

**Files:** `components/FilterSidebar.tsx`, `components/SourceHealth.tsx`.

- Desktop sidebar panel kept; mobile drawer reimplemented with shadcn `Sheet` (replace the hand-rolled overlay + focus logic — Radix handles focus/scroll-lock/Esc). Drive open state from the existing store `filtersOpen`.
- Filters → `Checkbox` + `Label` (severities, ecosystems, display toggles incl. `affectedOnly`/`stackMatchOnly`/`kevOnly`/`hideRead`/`showDismissed`, sources). Section headings via `separator` + typography.
- Source rows: status dot → `IconPointFilled` colored by state + `Tooltip` (healthy/recovering/failing); keep counts.
- `SourceHealth` (global widget) restyled as a `Card`/`Sheet` with status icons; preserve its data/props.

- [ ] **Step 1: Implement.** Preserve every filter's wiring and the `SourceOption` contract.
- [ ] **Step 2: Verify** typecheck + lint clean. Leave unstaged.

---

## Task E — Chrome (layout, nav, header widgets)

**Files:** `app/layout.tsx`, `components/NavLinks.tsx`, `components/FiltersTrigger.tsx`, `components/LastUpdated.tsx`, `components/AlertLog.tsx`.

- Header: shadcn-styled; `NavLinks` active state via tokens; `FiltersTrigger` → `Button` + `IconFilter`; `LastUpdated` → `IconClock` + relative time.
- `AlertLog` → `Card`/`Sheet`/`Popover` with `IconBell`; preserve its data/props.
- (Layout also mounts `<VulnPreviewModal/>` — added in Task G.)

- [ ] **Step 1: Implement.** Keep all server-loaded props (`lastRun`, `sources`, `alerted`).
- [ ] **Step 2: Verify** typecheck + lint clean. Leave unstaged.

---

## Task F — Detail content component + detail shards; remove the page

**Files:** create `components/VulnDetailContent.tsx`; modify `apps/dashboard/scripts/build-index.ts`; delete `app/vuln/[id]/page.tsx` (and the now-empty `app/vuln/` tree); modify `lib/data.ts` (remove `loadAllVulns`).

- [ ] **Step 1: `VulnDetailContent`** — move the detail JSX from the old `vuln/[id]/page.tsx` into `components/VulnDetailContent.tsx` taking `{ vuln: Vuln }`, restyled: section blocks → `Card`, facts grid, Badges (Task B), affected list, sources as links with `IconExternalLink`, "Why this priority?" `Card`. No `back` link (the modal closes instead).

- [ ] **Step 2: Extend the generator to emit shards**

In `apps/dashboard/scripts/build-index.ts`, after writing `index.json`, also write per-vuln shards:

```ts
const vulnDir = join(outDir, 'vuln');
mkdirSync(vulnDir, { recursive: true });
for (const v of vulns) {
  writeFileSync(join(vulnDir, `${encodeURIComponent(v.id)}.json`), JSON.stringify(v), 'utf8');
}
console.log(`[build-index] wrote ${vulns.length} detail shards to ${vulnDir}`);
```

- [ ] **Step 3: Remove the page + loadAllVulns**

Delete `apps/dashboard/app/vuln/[id]/page.tsx` (and the empty `app/vuln/[id]` and `app/vuln` dirs). In `lib/data.ts`, remove the now-unused `loadAllVulns` export. Grep to confirm no remaining importers (`grep -rn loadAllVulns apps/dashboard` → none).

- [ ] **Step 4: Verify**

Run the generator: `pnpm --filter @sec/dashboard exec tsx scripts/build-index.ts` → confirms it writes the index + `<N>` shards. Confirm `apps/dashboard/public/data/vuln/` is git-ignored (covered by the existing `apps/dashboard/public/data/` rule). `pnpm --filter @sec/dashboard typecheck` clean. Leave unstaged.

---

## Task G — Preview modal (responsive, URL-synced, lazy)

**Files:** create `lib/useVulnParam.ts`, `lib/useVulnDetail.ts`, `components/VulnPreviewModal.tsx`; modify `app/layout.tsx` (mount it); confirm `VulnRow` (Task C) calls `openVuln`.

**Interfaces:**
- `useVulnParam(): { id: string | null; openVuln: (id: string) => void; close: () => void }` — reads/writes the `?v=` search param via `useSearchParams` + `history.pushState`/`back`, with a `popstate` listener so back/forward and shareable links work.
- `useVulnDetail(id): { vuln: Vuln | null; loading; error }` — fetches `/data/vuln/<encodeURIComponent(id)>.json`, module-cached per id.

- [ ] **Step 1: `useVulnParam.ts`**

```ts
'use client';
import { useCallback, useEffect, useState } from 'react';

function currentV(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('v');
}

export function useVulnParam() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(currentV());
    const onPop = () => setId(currentV());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const openVuln = useCallback((vid: string) => {
    const u = new URL(window.location.href);
    u.searchParams.set('v', vid);
    window.history.pushState({}, '', u);
    setId(vid);
  }, []);
  const close = useCallback(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get('v') !== null) {
      window.history.back(); // restores the list URL; popstate updates id
      setTimeout(() => { if (currentV() !== null) { const u2 = new URL(window.location.href); u2.searchParams.delete('v'); window.history.replaceState({}, '', u2); setId(null); } }, 0);
    } else setId(null);
  }, []);
  return { id, openVuln, close };
}
```

- [ ] **Step 2: `useVulnDetail.ts`** — module-cached per-id fetch of `/data/vuln/<encodeURIComponent(id)>.json` returning `{ vuln, loading, error }` (mirror the `useVulnIndex` pattern; cache keyed by id; reset cache entry on error).

- [ ] **Step 3: `VulnPreviewModal.tsx`** — mounted once. Uses `useVulnParam()`; open = `id != null`. Responsive: a `useIsDesktop()` (matchMedia `(min-width: 768px)`) chooses shadcn `Dialog` (centered, `sm:max-w-3xl`, `max-h-[85vh]` scroll body) vs `Drawer` (vaul, bottom). On open, `useVulnDetail(id)` → `Skeleton` while loading, "Couldn't load this vulnerability." on error, else `<VulnDetailContent vuln={vuln} />`. `onOpenChange(false)` → `close()`. Title = the vuln id/cve for a11y (`DialogTitle`/`DrawerTitle`, visually-hidden if needed).

- [ ] **Step 4: Mount + wire**

In `app/layout.tsx`, render `<VulnPreviewModal />` inside `<body>` (after `{children}`). Ensure `VulnRow` (Task C) imports `openVuln` from `useVulnParam` and calls it on plain click (keeping the `?v=` anchor href for new-tab).

- [ ] **Step 5: Verify**

`pnpm --filter @sec/dashboard typecheck` + `pnpm lint` clean. (End-to-end verified in Final.) Leave unstaged.

---

## Final

- [ ] `pnpm --filter @sec/dashboard exec tsx scripts/build-index.ts` (generate index + shards for dev).
- [ ] `pnpm -r typecheck` clean; `pnpm lint` clean.
- [ ] `pnpm --filter @sec/dashboard build` — exports successfully and is materially faster (no 10k static pages). Confirm `out/data/index.json` and `out/data/vuln/*.json` exist and `out/vuln/` does NOT.
- [ ] `pnpm dev` visual pass: list renders with shadcn styling + Tabler icons; pagination/filters/search/sort/affected-only work; clicking a row opens the modal (desktop Dialog), `?v=` in URL, back closes, refresh-with-`?v=` reopens; narrow viewport uses the Drawer; mobile filter Sheet works.
- [ ] Leave everything unstaged on `main`.

## Self-Review

**Spec coverage:** foundation/tokens (A) · badge consolidation (B) · list surface (C) · sidebar+sheet (D) · chrome (E) · detail content + shards + page removal (F) · responsive URL-synced modal (G) · build/visual gate (Final). Behavior-preservation and static-export constraints are stated per task.

**Placeholders:** load-bearing pieces (globals.css, components.json, cn, generator shards, useVulnParam, modal wiring) have full code; visual restyles are specified by primitive + icon + preserved-behavior + file, to be executed against the CLI-generated `components/ui/*` with frontend-design judgment (intentional — verbatim JSX for ~12 components would be brittle against generated primitives).

**Type/contract consistency:** `IndexEntry` (list) vs full `Vuln` (modal shard) kept distinct; `openVuln`/`useVulnParam` shared by VulnRow (C) and the modal (G); the generator extension reuses the Task-2 script; `public/data/` gitignore already covers shards.

**Open decisions:** new-york style + lucide-internal primitives (Tabler for app icons); modal-only detail (no SSR page); blue accent retained — all per spec, non-blocking.
