'use client';
import type { IndexEntry } from '@sec/shared';
import {
  IconFlame,
  IconBomb,
  IconCode,
  IconShieldCheck,
  IconShieldOff,
  IconClock,
  IconDatabase,
  IconCheck,
  IconCircleDot,
  IconX,
} from '@tabler/icons-react';
import { useStore } from '../lib/store';
import { useVulnParam } from '../lib/useVulnParam';
import { PriorityBadge } from './PriorityBadge';
import { SeverityPill } from './SeverityPill';
import { StackMatchChips } from './StackMatchChips';
import { ExposureBadge } from './ExposureBadge';
import { StatusBadge } from './StatusBadge';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { cn } from '../lib/utils';

function relativeAge(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diffH = (Date.now() - t) / 3_600_000;
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))}m`;
  if (diffH < 24) return `${Math.round(diffH)}h`;
  return `${Math.round(diffH / 24)}d`;
}

export function VulnRow({
  vuln,
  index,
  active = false,
  onActivate,
}: {
  vuln: IndexEntry;
  index: number;
  active?: boolean;
  onActivate?: (i: number) => void;
}) {
  const readIds = useStore((s) => s.readIds);
  const markRead = useStore((s) => s.markRead);
  const unmarkRead = useStore((s) => s.unmarkRead);
  const dismiss = useStore((s) => s.dismiss);
  const read = readIds.includes(vuln.id);
  const { openVuln } = useVulnParam();

  const open = () => {
    onActivate?.(index);
    openVuln(vuln.id);
  };

  // Whole row is clickable, but don't hijack text selection or clicks that
  // land on the title link / action buttons (those handle themselves).
  const onRowClick = (e: React.MouseEvent) => {
    if (window.getSelection()?.toString()) return;
    if ((e.target as HTMLElement).closest('a,button,input,label')) return;
    open();
  };

  return (
    <TooltipProvider>
      <div
        data-row-index={index}
        onClick={onRowClick}
        className={cn(
          'group relative flex cursor-pointer flex-col gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-accent/30 sm:flex-row sm:items-start sm:gap-4',
          active && 'bg-accent/25 ring-1 ring-inset ring-ring',
          read && 'opacity-60',
        )}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0 sm:gap-4">
          <PriorityBadge priority={vuln.priority} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <SeverityPill severity={vuln.severity} />
              <ExposureBadge exposure={vuln.exposure} />
              {vuln.kev && (
                <StatusBadge variant="kev" icon={IconFlame}>KEV</StatusBadge>
              )}
              {vuln.exploitMaturity === 'weaponized' && (
                <StatusBadge variant="exploit-weaponized" icon={IconBomb}>weaponized</StatusBadge>
              )}
              {vuln.exploitMaturity === 'poc' && (
                <StatusBadge variant="exploit-poc" icon={IconCode}>poc</StatusBadge>
              )}
              {vuln.exposure?.status === 'affected' && (
                vuln.patchAvailable ? (
                  <StatusBadge variant="patch" icon={IconShieldCheck}>Patch</StatusBadge>
                ) : (
                  <StatusBadge variant="exposure-affected" icon={IconShieldOff}>No patch</StatusBadge>
                )
              )}
              <span className="font-mono text-[11px]">{vuln.cveId ?? vuln.ghsaId ?? vuln.id}</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <IconClock className="size-3" />
                {relativeAge(vuln.publishedAt)}
              </span>
            </div>
            <a
              href={`?v=${encodeURIComponent(vuln.id)}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                  return; // let the browser open the real link (e.g. new tab)
                }
                e.preventDefault();
                open();
              }}
              className="mt-0.5 block text-[15px] font-medium text-foreground line-clamp-2 underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none md:truncate"
            >
              {vuln.title}
            </a>
            <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <StackMatchChips match={vuln.stackMatch} />
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-full">
                <IconDatabase className="size-3 shrink-0" />
                {vuln.sources.join(', ')}
              </span>
            </div>
          </div>
        </div>
        <div className="relative z-10 flex items-center gap-1 self-end sm:self-auto sm:shrink-0 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (read) { unmarkRead(vuln.id); } else { markRead(vuln.id); }
                }}
                aria-label={read ? 'Mark unread' : 'Mark read'}
              >
                {read ? (
                  <IconCircleDot className="size-4" />
                ) : (
                  <IconCheck className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {read ? 'Mark unread' : 'Mark read'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  dismiss(vuln.id);
                }}
                aria-label="Dismiss"
              >
                <IconX className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Dismiss</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
