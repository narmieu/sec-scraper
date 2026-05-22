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
      className={`group flex items-start gap-4 border-b border-zinc-800 px-4 py-3 transition-colors hover:bg-[var(--color-surface)] ${
        read ? 'opacity-60' : ''
      }`}
    >
      <PriorityBadge priority={vuln.priority} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
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
          className="mt-0.5 block truncate text-[15px] font-medium text-[var(--color-fg)] hover:text-[var(--color-accent)]"
          title={vuln.title}
        >
          {vuln.title}
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <StackMatchChips match={vuln.stackMatch} />
          <span className="text-[11px] text-[var(--color-muted)]">
            {vuln.sources.map((s) => s.source).join(', ')}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => (read ? unmarkRead(vuln.id) : markRead(vuln.id))}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
          type="button"
        >
          {read ? 'unread' : 'read'}
        </button>
        <button
          onClick={() => dismiss(vuln.id)}
          className="rounded border border-zinc-700 px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
          type="button"
        >
          dismiss
        </button>
      </div>
    </div>
  );
}
