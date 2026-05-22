import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadAllVulns } from '../../../lib/data';
import { SeverityPill } from '../../../components/SeverityPill';
import { PriorityBadge } from '../../../components/PriorityBadge';
import { StackMatchChips } from '../../../components/StackMatchChips';

export async function generateStaticParams() {
  const vulns = loadAllVulns();
  return vulns.length > 0
    ? vulns.map((v) => ({ id: v.id }))
    : [{ id: '__placeholder__' }];
}

export const dynamic = 'force-static';
export const dynamicParams = false;

export default async function VulnDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const vuln = loadAllVulns().find((v) => v.id === decoded);
  if (!vuln) notFound();

  return (
    <article className="mx-auto max-w-3xl px-6 py-8">
      <Link href="/" className="text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]">
        ← back
      </Link>
      <header className="mt-3 flex items-start gap-4">
        <PriorityBadge priority={vuln.priority} />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={vuln.severity} />
            {vuln.kev && (
              <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-red-300">
                KEV
              </span>
            )}
            <span className="font-mono text-xs text-[var(--color-muted)]">
              {vuln.cveId ?? vuln.ghsaId ?? vuln.id}
            </span>
          </div>
          <h1 className="mt-2 text-xl font-semibold">{vuln.title}</h1>
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
        {vuln.cvss !== undefined && <Fact label="CVSS" value={vuln.cvss.toFixed(1)} />}
        {vuln.epss !== undefined && (
          <Fact label="EPSS" value={`${(vuln.epss * 100).toFixed(1)}%`} />
        )}
        <Fact label="Published" value={new Date(vuln.publishedAt).toLocaleString()} />
        <Fact label="Modified" value={new Date(vuln.modifiedAt).toLocaleString()} />
        <Fact label="Ecosystems" value={vuln.ecosystems.join(', ') || '—'} />
        {vuln.cwe.length > 0 && <Fact label="CWE" value={vuln.cwe.join(', ')} />}
      </section>

      <section className="mt-6">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Stack match
        </h2>
        <StackMatchChips match={vuln.stackMatch} />
        {vuln.stackMatch.score === 0 && (
          <p className="text-sm text-[var(--color-muted)]">No match in tracked stack.</p>
        )}
      </section>

      {vuln.summary && (
        <section className="mt-6">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Summary
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{vuln.summary}</p>
        </section>
      )}

      {vuln.details && vuln.details !== vuln.summary && (
        <section className="mt-6">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Details
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-fg)]">
            {vuln.details}
          </p>
        </section>
      )}

      {vuln.affected.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Affected
          </h2>
          <ul className="space-y-1 text-sm">
            {vuln.affected.map((a, i) => (
              <li key={`${a.ecosystem}-${a.package}-${i}`} className="font-mono">
                {a.ecosystem}:{a.package} · {a.versions}
                {a.fixedIn ? ` → fixed in ${a.fixedIn}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Sources
        </h2>
        <ul className="space-y-1 text-sm">
          {vuln.sources.map((s) => (
            <li key={`${s.source}-${s.externalId}`}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--color-accent)] underline-offset-2 hover:underline"
              >
                {s.source} · {s.externalId}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <ScoreBreakdown vuln={vuln} />
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function ScoreBreakdown({ vuln }: { vuln: { priority: number; severity: string; stackMatch: { score: number }; epss?: number; kev: boolean; publishedAt: string } }) {
  const ageDays =
    (Date.now() - new Date(vuln.publishedAt).getTime()) / 86_400_000;
  return (
    <section className="mt-8 rounded border border-zinc-800 bg-[var(--color-surface)] p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Why this priority?
      </h2>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
        <li>Severity: {vuln.severity}</li>
        <li>Stack match: {vuln.stackMatch.score}</li>
        <li>EPSS: {vuln.epss !== undefined ? (vuln.epss * 100).toFixed(1) + '%' : '—'}</li>
        <li>KEV: {vuln.kev ? 'yes' : 'no'}</li>
        <li>Age: {ageDays.toFixed(1)} days</li>
        <li>Total: {vuln.priority}</li>
      </ul>
    </section>
  );
}
