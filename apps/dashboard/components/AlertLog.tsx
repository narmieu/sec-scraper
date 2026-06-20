'use client';
import { useState } from 'react';
import { IconBell } from '@tabler/icons-react';
import type { AlertedFile } from '@sec/shared';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export function AlertLog({ alerted }: { alerted: AlertedFile }) {
  const [open, setOpen] = useState(false);
  const week = Date.now() - 7 * 86_400_000;
  const recent = Object.entries(alerted)
    .filter(([, e]) => new Date(e.alertedAt).getTime() >= week)
    .sort(([, a], [, b]) => b.alertedAt.localeCompare(a.alertedAt));

  if (recent.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Alerts last 7 days (${recent.length})`}
          className={cn(
            'relative text-muted-foreground hover:text-foreground',
          )}
        >
          <IconBell className="size-4" />
          <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground leading-none">
            {recent.length}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 sm:max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-sm">
            <IconBell className="size-4 text-muted-foreground" />
            Alerts — last 7 days
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {recent.length}
            </span>
          </SheetTitle>
        </SheetHeader>
        <ul className="mt-2 flex flex-col gap-2 px-4 pb-4">
          {recent.map(([id, e]) => (
            <li
              key={id}
              className="rounded-md border border-border bg-card px-3 py-2 text-xs"
            >
              <p className="font-mono font-medium text-foreground truncate">{id}</p>
              <p className="mt-0.5 text-muted-foreground capitalize">
                {e.vulnSnapshot.severity} · priority {e.vulnSnapshot.priority}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {Object.entries(e.channels)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(', ')}
              </p>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
