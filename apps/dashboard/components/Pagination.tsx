'use client';
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from '@tabler/icons-react';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

// Windowed page list: 1 … (p-1 p p+1) … last
function pageList(page: number, pageCount: number): (number | 'gap')[] {
  const out: (number | 'gap')[] = [];
  const first = 1;
  const last = pageCount;
  const start = Math.max(first, page - 1);
  const end = Math.min(last, page + 1);
  out.push(first);
  if (start > first + 1) out.push('gap');
  for (let p = Math.max(first + 1, start); p <= Math.min(last - 1, end); p++) out.push(p);
  if (end < last - 1) out.push('gap');
  if (last > first) out.push(last);
  return out;
}

export function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  const pages = pageList(page, pageCount);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:justify-between">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPage(1)}
          aria-label="First page"
        >
          <IconChevronsLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="gap-1"
        >
          <IconChevronLeft className="size-4" />
          <span className="hidden sm:inline">Prev</span>
        </Button>
      </div>

      <div className="flex items-center gap-1">
        {pages.map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} className="px-1.5 select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === page ? 'page' : undefined}
              className={cn(
                'min-w-8 rounded-md px-2 py-1 tabular-nums transition-colors',
                p === page
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'hover:bg-accent/60 hover:text-foreground',
              )}
            >
              {p}
            </button>
          ),
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className="gap-1"
        >
          <span className="hidden sm:inline">Next</span>
          <IconChevronRight className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={page >= pageCount}
          onClick={() => onPage(pageCount)}
          aria-label="Last page"
        >
          <IconChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
