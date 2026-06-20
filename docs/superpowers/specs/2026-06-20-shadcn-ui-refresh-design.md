# shadcn UI Refresh — Design Spec

**Date:** 2026-06-20
**Status:** Approved direction (Polish refresh + Tabler icons); detailed design pending review
**Scope:** Dashboard presentation layer. Rebuild every UI surface on shadcn/ui primitives + Tabler icons, preserving the dark identity and all existing behavior (incl. Phase 0 list/pagination and Phase 1 exposure badges), AND replace the per-vuln detail **page** with a responsive **preview modal** (lazy-loaded detail shards). Single implementation plan, sequenced.

## Goal

Replace the dashboard's hand-rolled Tailwind markup with a consistent, professional shadcn/ui component system + real (Tabler) icons, using Tailwind v4 tokens efficiently — without changing layout, information architecture, or behavior — and turn vuln detail into a fast, responsive in-list **modal** instead of a separate page.

**Visual level:** *Polish refresh* — keep the dark zinc/blue identity and current layouts; gain shadcn primitives, icons, and tighter spacing/typography/hierarchy. Not a re-skin (we do tighten visuals) and not a redesign (no new layouts, no data-table swap — Phase 0's row list + pagination/filter logic stays).

## Non-goals (YAGNI)

- No layout/IA redesign; no TanStack DataTable (would discard Phase 0).
- No light theme / theme switcher (app is dark-only).
- No change to data flow, the compact index, filtering/sorting/search logic, or the scraper. (Detail routing DOES change — see the modal section.)
- No new shadcn components beyond those actually used.
- No unit tests (dashboard has none) — gate on typecheck + lint + build + manual visual pass.
- Detail modal is **modal-only**: the `/vuln/[id]` static route is removed (shareability preserved via `?v=<id>`); no SSR detail page is kept.

## Stack & compatibility

Tailwind v4 (CSS-first `@theme`, no config file), Next 16 static export (`output: 'export'`), React 19, `@/*` alias. shadcn/ui supports this stack. All shadcn components are client components (Radix) — compatible with static export (the list pages are already client-driven from Phase 0).

## Foundation

1. **Init:** `shadcn init` (Tailwind v4 mode) producing `apps/dashboard/components.json`, `apps/dashboard/lib/utils.ts` (`cn = twMerge(clsx(...))`), and component scaffolding under `components/ui/`.
2. **Token mapping** in `app/globals.css` — adopt shadcn's semantic tokens, mapping the existing OKLCH palette so the look is preserved (dark values, no separate `.dark` needed since the app is dark-only — define tokens at `:root`):

   | shadcn token | source |
   |---|---|
   | `--background` | current `--color-bg` (oklch 0.15 0 0) |
   | `--foreground` | `--color-fg` (0.95 0 0) |
   | `--card`, `--popover` | `--color-surface` (0.21 0 0) |
   | `--card-foreground`, `--popover-foreground` | `--color-fg` |
   | `--secondary`, `--muted`, `--accent` | `--color-surface-2` (0.27 0 0) |
   | `--muted-foreground` | `--color-muted` (0.65 0 0) |
   | `--secondary-foreground`, `--accent-foreground` | `--color-fg` |
   | `--primary`, `--ring` | `--color-accent` (oklch 0.72 0.18 250) |
   | `--primary-foreground` | near-white (0.98 0 0) |
   | `--border`, `--input` | zinc (~oklch 0.30 0 0) |
   | `--destructive` | `--color-critical` (0.65 0.21 25) |
   | `--radius` | 0.5rem |

   **Keep** the existing custom tokens `--color-critical/high/medium/low/unknown` (and `--color-accent`, `--color-surface*`) — severity/exposure colors have no shadcn semantic equivalent and are consumed by Badge variants. **Keep** the custom scrollbar utilities (`scrollbar-slim`, `scrollbar-fade`) and `::selection` as-is. Use shadcn's Tailwind v4 `@theme inline` block to bind tokens to utility classes per the shadcn v4 setup.
3. **Dependencies:** `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `@tabler/icons-react`, and the Radix packages pulled in by the components below. (Runtime deps — justified by the directive to adopt shadcn.)

## shadcn primitives to add (only what's used)

`button`, `badge`, `input`, `select`, `checkbox`, `label`, `card`, `sheet`, `dialog`, `drawer` (vaul), `tooltip`, `skeleton`, `separator`, `dropdown-menu`. (Add others only if a surface needs them.)

## Component restyle (Polish refresh — keep layout/behavior)

**Badge system (the consolidation win).** A single `components/Badge`-based set with cva variants replaces today's ad-hoc colored spans:
- `SeverityPill` → Badge variant per severity (critical/high/medium/low/unknown), colors from the kept custom tokens.
- `ExposureBadge` → Badge variants: affected (`IconAlertTriangle`), potential (`IconHelpCircle`), safe (`IconShieldCheck`); keeps the `unknown`→hidden + `patch <fixedIn>` behavior.
- KEV badge → Badge "kev" variant (`IconFlame`).
- `StackMatchChips` → small Badges (package chips) + a muted reason·score label.
- `PriorityBadge` → keep its numeric/threshold logic; restyle as a Badge/box using tokens.

**List surface.**
- `VulnRow` — same layout; Tabler icons for published-age (`IconClock`), sources (`IconDatabase`/text), external nav; read/dismiss become icon `Button`s (`IconCheck`/`IconCircle`, `IconX`) with `Tooltip`. Row hover/read states via tokens.
- `SearchBar` → `Input` with leading `IconSearch`.
- `SortSelect` → shadcn `Select`.
- `ActiveFilters` → removable `Badge`s with `IconX`.
- `Pagination` → shadcn-styled `Button`s + `IconChevronLeft`/`IconChevronRight` (Phase 0 logic unchanged).
- Loading skeleton → shadcn `Skeleton`.

**FilterSidebar.** Desktop panel + mobile drawer via shadcn `Sheet` (replaces the hand-rolled overlay). Filters as `Checkbox` + `Label`; `SectionHeading` via `separator`/typography; source rows with a status dot (`IconPointFilled` colored by state) + `Tooltip`; reset/clear as `Button` variants.

**Chrome (`layout.tsx` + global components).** Header with `NavLinks` (active state via tokens), `FiltersTrigger` as a `Button` + `IconFilter`, `LastUpdated` with `IconClock`. `SourceHealth` and `AlertLog` (currently fixed widgets) restyled as `Card`/`Sheet`/`Popover` with status icons.

**Detail content (now rendered in the modal — see next section).** The detail JSX moves into a reusable `VulnDetailContent` component: section blocks → `Card`s; facts grid kept; severity/exposure/KEV → Badges; sources as links with `IconExternalLink`; "Why this priority?" as a `Card`. The standalone `/vuln/[id]` page is removed.

## Detail preview modal (replaces the detail page)

Clicking a vuln opens a responsive modal that lazy-loads the full record — no navigation, shareable via URL.

**Detail shards.** Extend the Phase-0 build generator (`scripts/build-index.ts`) to ALSO emit one full-record JSON per vuln at `public/data/vuln/<encodeURIComponent(id)>.json` (the complete `Vuln`, so the modal has details/affected-ranges/source-URLs the compact index drops). Same git-ignored `public/data/` tree. ~10k small files — comparable to the 10k static pages we are deleting, but far cheaper (plain file writes, no per-page render).

**Shared content.** `components/VulnDetailContent.tsx` renders a full `Vuln` (the restyled detail JSX: Cards, facts grid, Badges, sources, score breakdown).

**Modal.** `components/VulnPreviewModal.tsx` (mounted once, in `layout.tsx`):
- Open state derives from the `?v=<id>` URL search param (via `useSearchParams`).
- Responsive: shadcn `Dialog` (centered, `max-w-3xl`, scrollable body) at ≥ md; shadcn `Drawer` (vaul bottom sheet) at < md. (Add `drawer` to the primitives.)
- On open, fetch `/data/vuln/<encodeURIComponent(id)>.json` (lazy, module-cached per id) → `Skeleton` while loading, friendly "not found" on 404/error, else `<VulnDetailContent>`.
- Close removes `?v=` (history back if it was pushed, else `router.replace`); Esc/overlay/back-button all close (Radix + popstate via the search param).

**Row interaction (`VulnRow`).** The row is an anchor `href={`?v=${encodeURIComponent(id)}`}` (relative to the current list path, so ⌘/ctrl/middle-click opens a new tab with the modal auto-open). A plain left-click `preventDefault`s and pushes `?v=` (shallow) so the modal opens in place. No full navigation.

**Routing changes.** Delete `app/vuln/[id]/page.tsx`. `lib/data.ts`'s `loadAllVulns` becomes unused (the generator reads `vulns.json` directly) → remove it. Build no longer generates 10k static pages.

**Static-export compatibility.** `?v=` is a client-only search param (no server routing needed); Radix Dialog/vaul Drawer are client components. Fully compatible with `output: 'export'`.

## "Use shadcn + Tailwind efficiently"

- Centralize visual variants in cva (`badgeVariants`, reuse shadcn `buttonVariants`); never repeat long class strings across components.
- `cn()` for all conditional classes.
- Reference tokens only (no ad-hoc hex/oklch inside components); a consistent spacing/typography scale.
- Prefer one shared component over near-duplicates (the Badge consolidation above).

## Sequencing (one plan, sequenced tasks)

- **Task A — Foundation:** init, token-mapped `globals.css`, `cn`, deps, Tabler, base `components/ui/*` (button, badge, input, select, checkbox, label, card, sheet, drawer, tooltip, skeleton, separator). Gate: build still exports.
- **Task B — Badge system + icons:** the cva Badge set; migrate SeverityPill/ExposureBadge/KEV/StackMatchChips/PriorityBadge.
- **Task C — List surface:** VulnRow (incl. the `?v=` anchor + click-to-open-modal behavior), SearchBar, SortSelect, ActiveFilters, Pagination, skeleton.
- **Task D — FilterSidebar (+ Sheet) + source health.**
- **Task E — Chrome:** layout/header/NavLinks/FiltersTrigger/LastUpdated/SourceHealth/AlertLog.
- **Task F — Detail content + shards:** `VulnDetailContent` (restyled), extend the generator to emit per-vuln shards, delete `app/vuln/[id]/page.tsx` + remove `loadAllVulns`.
- **Task G — Preview modal:** `VulnPreviewModal` (responsive Dialog/Drawer, `?v=` sync, lazy shard fetch, skeleton/error), mounted in `layout.tsx`; verify row → modal end-to-end.
- **Final:** `pnpm -r typecheck`, `pnpm lint`, `pnpm --filter @sec/dashboard build`, and a `pnpm dev` visual pass over list + modal (desktop Dialog / mobile Drawer) + filters.

## Testing / acceptance

1. `shadcn init` + token mapping leaves the app building and visually equivalent-or-better in dark mode.
2. Every listed surface renders via shadcn primitives + Tabler icons; no remaining ad-hoc colored `<span>` badges or hand-rolled selects/checkboxes/overlays.
3. All behavior preserved: filtering, sorting, search, pagination, exposure/affected-only, read/dismiss, mobile filter drawer.
4. Clicking a vuln opens the detail **modal** (Dialog desktop / Drawer mobile) with lazily-loaded full detail; `?v=<id>` makes it shareable and back-button closes; ⌘/middle-click opens in a new tab; the `/vuln/[id]` page no longer exists.
5. `pnpm -r typecheck` + `pnpm lint` clean; `pnpm --filter @sec/dashboard build` exports successfully and is materially faster (no 10k static detail pages).
6. No regression to data flow, the index/list, or the scraper.

## Open decisions

1. Keep the current blue accent (`oklch 0.72 0.18 250`) as `--primary` — yes (preserve identity); tunable later.
2. `tw-animate-css` vs `tailwindcss-animate` for Tailwind v4 — use whichever `shadcn init` selects for v4 (currently `tw-animate-css`).
3. SourceHealth/AlertLog presentation (fixed widget vs `Sheet`/`Popover`) — finalize in the plan from the current components' behavior.
