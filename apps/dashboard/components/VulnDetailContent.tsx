'use client';

import type { Vuln } from '@sec/shared';
import { IconExternalLink, IconFlame, IconBomb, IconCode, IconShieldCheck, IconShieldOff } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { SeverityPill } from './SeverityPill';
import { PriorityBadge } from './PriorityBadge';
import { ExposureBadge } from './ExposureBadge';
import { StatusBadge } from './StatusBadge';
import { StackMatchChips } from './StackMatchChips';

// ---------------------------------------------------------------------------
// Helpers (file-local)
// ---------------------------------------------------------------------------

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium text-sm">{value}</div>
    </div>
  );
}

function ScoreBreakdown({
  vuln,
}: {
  vuln: Pick<Vuln, 'priority' | 'severity' | 'stackMatch' | 'epss' | 'kev' | 'publishedAt'>;
}) {
  const ageDays = (Date.now() - new Date(vuln.publishedAt).getTime()) / 86_400_000;
  return (
    <Card className={cn('mt-6')}>
      <CardHeader>
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
          Why this priority?
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
          <li>Severity: {vuln.severity}</li>
          <li>Stack match: {vuln.stackMatch.score}</li>
          <li>EPSS: {vuln.epss !== undefined ? (vuln.epss * 100).toFixed(1) + '%' : '—'}</li>
          <li>KEV: {vuln.kev ? 'yes' : 'no'}</li>
          <li>Age: {ageDays.toFixed(1)} days</li>
          <li>Total: {vuln.priority}</li>
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function VulnDetailContent({ vuln }: { vuln: Vuln }) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-8 break-words">
      {/* Header */}
      <header className="flex items-start gap-4">
        <PriorityBadge priority={vuln.priority} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={vuln.severity} />
            {vuln.kev && (
              <StatusBadge variant="kev">KEV</StatusBadge>
            )}
            {vuln.exposure && <ExposureBadge exposure={vuln.exposure} />}
            <span className="font-mono text-xs text-muted-foreground">
              {vuln.cveId ?? vuln.ghsaId ?? vuln.id}
            </span>
          </div>
          <h1 className="mt-2 text-xl font-semibold break-words">{vuln.title}</h1>
        </div>
      </header>

      {/* Facts grid */}
      <Card className="mt-5">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 py-4 md:grid-cols-3">
          {vuln.cvss !== undefined && <Fact label="CVSS" value={vuln.cvss.toFixed(1)} />}
          {vuln.epss !== undefined && (
            <Fact label="EPSS" value={`${(vuln.epss * 100).toFixed(1)}%`} />
          )}
          <Fact label="Published" value={new Date(vuln.publishedAt).toLocaleDateString()} />
          <Fact label="Modified" value={new Date(vuln.modifiedAt).toLocaleDateString()} />
          <Fact label="Ecosystems" value={vuln.ecosystems.join(', ') || '—'} />
          {vuln.cwe.length > 0 && <Fact label="CWE" value={vuln.cwe.join(', ')} />}
        </CardContent>
      </Card>

      {/* Stack match */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
            Stack match
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vuln.stackMatch.score === 0 ? (
            <p className="text-sm text-muted-foreground">No match in tracked stack.</p>
          ) : (
            <StackMatchChips match={vuln.stackMatch} />
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {vuln.summary && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{vuln.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Details */}
      {vuln.details && vuln.details !== vuln.summary && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {vuln.details}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Affected */}
      {vuln.affected.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Affected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {vuln.affected.map((a, i) => (
                <li key={`${a.ecosystem}-${a.package}-${i}`} className="font-mono">
                  {a.ecosystem}:{a.package} · {a.versions}
                  {a.fixedIn ? ` → fixed in ${a.fixedIn}` : ''}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Exploit */}
      {(vuln.exploit?.maturity || vuln.kev) && (() => {
        const maturity = vuln.exploit?.maturity ?? (vuln.kev ? 'active' : undefined);
        const patchAvailable = vuln.affected.some((a) => a.fixedIn);
        const MaturityIcon =
          maturity === 'active' ? IconFlame :
          maturity === 'weaponized' ? IconBomb :
          maturity === 'poc' ? IconCode : null;
        const maturityVariant =
          maturity === 'active' ? 'exploit-active' as const :
          maturity === 'weaponized' ? 'exploit-weaponized' as const :
          'exploit-poc' as const;
        return (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                Exploit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                {maturity && MaturityIcon && (
                  <StatusBadge variant={maturityVariant} icon={MaturityIcon}>
                    {maturity}
                  </StatusBadge>
                )}
                {patchAvailable ? (
                  <StatusBadge variant="patch" icon={IconShieldCheck}>Patch available</StatusBadge>
                ) : (
                  <StatusBadge variant="exposure-affected" icon={IconShieldOff}>No patch</StatusBadge>
                )}
              </div>
              {vuln.exploit?.refs && vuln.exploit.refs.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {vuln.exploit.refs.map((ref, i) => (
                    <li key={i}>
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-start gap-1 text-primary underline-offset-2 hover:underline break-all"
                      >
                        <IconExternalLink className="size-3.5 shrink-0 mt-0.5" />
                        {ref.source}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Sources */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
            Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {vuln.sources.map((s) => (
              <li key={`${s.source}-${s.externalId}`}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-1 text-primary underline-offset-2 hover:underline break-all"
                >
                  <IconExternalLink className="size-3.5 shrink-0 mt-0.5" />
                  {s.source} · {s.externalId}
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Score breakdown */}
      <ScoreBreakdown vuln={vuln} />
    </article>
  );
}
