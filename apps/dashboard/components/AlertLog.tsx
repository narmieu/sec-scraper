'use client';
import { useState } from 'react';
import { IconBell, IconChecks } from '@tabler/icons-react';
import type { AlertedFile } from '@sec/shared';
import { useStore } from '@/lib/store';
import { useVulnParam } from '@/lib/useVulnParam';
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
  const readAlertIds = useStore((s) => s.readAlertIds);
  const markAlertRead = useStore((s) => s.markAlertRead);
  const markAllAlertsRead = useStore((s) => s.markAllAlertsRead);
  const { openVuln } = useVulnParam();

  const week = Date.now() - 7 * 86_400_000;
  const recent = Object.entries(alerted)
    .filter(([, e]) => new Date(e.alertedAt).getTime() >= week)
    .sort(([, a], [, b]) => b.alertedAt.localeCompare(a.alertedAt));

  if (recent.length === 0) return null;

  const unreadCount = recent.reduce((n, [id]) => (readAlertIds.includes(id) ? n : n + 1), 0);

  // Open the related vulnerability, mark the alert read, and close the panel.
  const openAlert = (id: string) => {
    markAlertRead(id);
    setOpen(false);
    openVuln(id);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Alerts — ${unreadCount} unread of ${recent.length}`}
          className="relative text-muted-foreground hover:text-foreground"
        >
          <IconBell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground leading-none">
              {unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 sm:max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 pr-8 text-sm">
            <IconBell className="size-4 text-muted-foreground" />
            Alerts — last 7 days
            {unreadCount > 0 && (
              <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                {unreadCount} new
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {unreadCount > 0 && (
          <div className="px-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => markAllAlertsRead(recent.map(([id]) => id))}
            >
              <IconChecks className="size-4" />
              Mark all as read
            </Button>
          </div>
        )}

        <ul className="mt-2 flex flex-col gap-2 px-4 pb-4">
          {recent.map(([id, e]) => {
            const isRead = readAlertIds.includes(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => openAlert(id)}
                  aria-label={`${isRead ? 'Read' : 'Unread'} alert ${id} — open details`}
                  className={cn(
                    'w-full break-words rounded-md border px-3 py-2 text-left text-xs transition-colors hover:border-ring hover:bg-accent/40',
                    isRead
                      ? 'border-border bg-card opacity-60'
                      : 'border-primary/40 bg-primary/5',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-1 size-2 shrink-0 rounded-full',
                        isRead ? 'bg-transparent' : 'bg-primary',
                      )}
                      aria-hidden
                    />
                    <p className="min-w-0 flex-1 break-all font-mono font-medium text-foreground">
                      {id}
                    </p>
                  </div>
                  <p className="mt-0.5 pl-4 text-muted-foreground capitalize">
                    {e.vulnSnapshot.severity} · priority {e.vulnSnapshot.priority}
                  </p>
                  <p className="mt-0.5 pl-4 text-muted-foreground">
                    {Object.entries(e.channels)
                      .map(([k, v]) => `${k}:${v}`)
                      .join(', ')}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
