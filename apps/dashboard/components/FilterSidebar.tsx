'use client';
import { SEVERITIES, ECOSYSTEMS, type Ecosystem, type Severity } from '@sec/shared';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { IconPointFilled } from '@tabler/icons-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';

export interface SourceOption {
  id: string;
  count: number;
  state: 'closed' | 'open' | 'half-open';
}

const STATE_COLOR: Record<SourceOption['state'], string> = {
  closed: 'text-emerald-500',
  'half-open': 'text-yellow-400',
  open: 'text-red-500',
};

const STATE_LABEL: Record<SourceOption['state'], string> = {
  closed: 'healthy',
  'half-open': 'recovering',
  open: 'failing',
};

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function FilterSidebar({ sourceOptions }: { sourceOptions: SourceOption[] }) {
  const filtersOpen = useStore((s) => s.filtersOpen);
  const setFiltersOpen = useStore((s) => s.setFiltersOpen);

  return (
    <>
      {/* Desktop sticky sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 border-r border-border bg-background p-4 overflow-y-auto sticky top-[57px] self-start max-h-[calc(100vh-57px)] scrollbar-fade">
        <FilterPanel sourceOptions={sourceOptions} />
      </aside>

      {/* Mobile Sheet (Radix handles focus-trap, Esc, scroll-lock) */}
      <div className="lg:hidden">
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent
            side="left"
            className="w-72 max-w-[85vw] bg-background border-r border-border p-0 overflow-y-auto scrollbar-slim"
            showCloseButton={false}
          >
            <SheetHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between">
              <SheetTitle className="text-sm font-semibold">Filters</SheetTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFiltersOpen(false)}
                className="shrink-0"
              >
                Close
              </Button>
            </SheetHeader>
            <div className="px-4 pb-4">
              <FilterPanel sourceOptions={sourceOptions} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function FilterPanel({ sourceOptions }: { sourceOptions: SourceOption[] }) {
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const reset = useStore((s) => s.reset);

  return (
    <TooltipProvider>
      {/* Severity */}
      <SectionHeading>Severity</SectionHeading>
      <ul className="mb-4 space-y-1">
        {SEVERITIES.map((s) => {
          const id = `filter-severity-${s}`;
          return (
            <li key={s} className="flex items-center gap-2 py-0.5">
              <Checkbox
                id={id}
                checked={filters.severities.includes(s)}
                onCheckedChange={() =>
                  setFilters({ severities: toggle(filters.severities, s as Severity) })
                }
              />
              <Label htmlFor={id} className="cursor-pointer capitalize font-normal text-foreground/80 hover:text-foreground">
                {s}
              </Label>
            </li>
          );
        })}
      </ul>

      <Separator className="mb-4" />

      {/* Ecosystem */}
      <SectionHeading>Ecosystem</SectionHeading>
      <ul className="mb-4 space-y-1">
        {ECOSYSTEMS.map((e) => {
          const id = `filter-ecosystem-${e}`;
          return (
            <li key={e} className="flex items-center gap-2 py-0.5">
              <Checkbox
                id={id}
                checked={filters.ecosystems.includes(e)}
                onCheckedChange={() =>
                  setFilters({ ecosystems: toggle(filters.ecosystems, e as Ecosystem) })
                }
              />
              <Label htmlFor={id} className="cursor-pointer font-normal text-foreground/80 hover:text-foreground">
                {e}
              </Label>
            </li>
          );
        })}
      </ul>

      <Separator className="mb-4" />

      {/* Display toggles */}
      <SectionHeading>Display</SectionHeading>
      <ul className="mb-4 space-y-1 text-sm">
        {[
          { key: 'affectedOnly' as const, label: 'Affected only' },
          { key: 'stackMatchOnly' as const, label: 'Stack match only' },
          { key: 'kevOnly' as const, label: 'KEV only (actively exploited)' },
          { key: 'hideRead' as const, label: 'Hide read' },
          { key: 'showDismissed' as const, label: 'Show dismissed' },
          { key: 'hasExploit' as const, label: 'Has exploit' },
          { key: 'noPatch' as const, label: 'No patch' },
        ].map(({ key, label }) => {
          const id = `filter-display-${key}`;
          return (
            <li key={key} className="flex items-center gap-2 py-0.5">
              <Checkbox
                id={id}
                checked={filters[key]}
                onCheckedChange={(checked) =>
                  setFilters({ [key]: checked === true })
                }
              />
              <Label htmlFor={id} className="cursor-pointer font-normal text-foreground/80 hover:text-foreground">
                {label}
              </Label>
            </li>
          );
        })}
      </ul>

      {/* Sources */}
      {sourceOptions.length > 0 && (
        <>
          <Separator className="mb-4" />
          <div className="mb-2 flex items-center justify-between">
            <SectionHeading>Sources</SectionHeading>
            {filters.sources.length > 0 && (
              <button
                type="button"
                onClick={() => setFilters({ sources: [] })}
                className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                clear
              </button>
            )}
          </div>
          <ul className="mb-4 max-h-72 overflow-y-auto pr-1 space-y-1 scrollbar-slim">
            {sourceOptions.map((s) => {
              const active = filters.sources.includes(s.id);
              const id = `filter-source-${s.id}`;
              return (
                <li key={s.id} className="flex items-center gap-2 py-0.5">
                  <Checkbox
                    id={id}
                    checked={active}
                    onCheckedChange={() =>
                      setFilters({ sources: toggle(filters.sources, s.id) })
                    }
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn('shrink-0', STATE_COLOR[s.state])}>
                        <IconPointFilled size={10} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {STATE_LABEL[s.state]}
                    </TooltipContent>
                  </Tooltip>
                  <Label
                    htmlFor={id}
                    className={cn(
                      'cursor-pointer font-normal truncate flex-1 hover:text-foreground',
                      active ? 'text-foreground' : 'text-foreground/70',
                    )}
                  >
                    {s.id}
                  </Label>
                  <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                    {s.count}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={reset}
        className="mt-2 w-full text-muted-foreground hover:text-foreground"
      >
        Reset all
      </Button>
    </TooltipProvider>
  );
}
