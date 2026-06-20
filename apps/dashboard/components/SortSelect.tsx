'use client';
import { IconArrowsSort, IconCheck } from '@tabler/icons-react';
import { SORT_OPTIONS, useStore } from '../lib/store';
import type { SortKey } from '../lib/store';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';
import { Button } from './ui/button';

export function SortSelect() {
  const sort = useStore((s) => s.sort);
  const setSort = useStore((s) => s.setSort);
  const current = SORT_OPTIONS.find((o) => o.key === sort);

  return (
    <>
      {/* Desktop: inline dropdown */}
      <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground">
        <span>Sort</span>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger size="sm" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.key} value={o.key} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mobile: bottom sheet of options (radix Sheet — same primitive as the
          filter sidebar, which re-renders the list on change without flicker). */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              aria-label={`Sort: ${current?.label ?? 'choose'}`}
            >
              <IconArrowsSort className="size-3.5" />
              {current?.label ?? 'Sort'}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="gap-0 rounded-t-lg">
            <SheetHeader className="text-left">
              <SheetTitle>Sort by</SheetTitle>
            </SheetHeader>
            <ul className="px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {SORT_OPTIONS.map((o) => {
                const active = o.key === sort;
                return (
                  <li key={o.key}>
                    <SheetClose asChild>
                      <button
                        type="button"
                        onClick={() => setSort(o.key)}
                        aria-current={active ? 'true' : undefined}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-3 py-3 text-sm transition-colors',
                          active
                            ? 'bg-accent text-accent-foreground'
                            : 'text-foreground hover:bg-accent/60',
                        )}
                      >
                        {o.label}
                        {active && <IconCheck className="size-4 text-primary" />}
                      </button>
                    </SheetClose>
                  </li>
                );
              })}
            </ul>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
