import { createHash } from 'node:crypto';
import { Vuln } from '@sec/shared';
import type { Affected, Severity, Vuln as VulnT } from '@sec/shared';

export function cvssToSeverity(cvss: number | undefined): Severity {
  if (cvss === undefined || cvss <= 0) return 'unknown';
  if (cvss >= 9.0) return 'critical';
  if (cvss >= 7.0) return 'high';
  if (cvss >= 4.0) return 'medium';
  return 'low';
}

export function deriveSeverity(input: { cvss?: number | undefined; ghsaSeverity?: string | undefined }): Severity {
  if (input.cvss !== undefined && input.cvss > 0) return cvssToSeverity(input.cvss);
  const g = input.ghsaSeverity?.toLowerCase();
  if (g === 'critical') return 'critical';
  if (g === 'high') return 'high';
  if (g === 'medium' || g === 'moderate') return 'medium';
  if (g === 'low') return 'low';
  return 'unknown';
}

export function canonicalId(input: {
  cveId?: string | undefined;
  ghsaId?: string | undefined;
  title?: string | undefined;
  publishedAt?: string | undefined;
}): string {
  if (input.cveId) return input.cveId;
  if (input.ghsaId) return input.ghsaId;
  const seed = `${input.title ?? ''}|${input.publishedAt ?? ''}`;
  const h = createHash('sha1').update(seed).digest('hex').slice(0, 12);
  return `h-${h}`;
}

export function normalizeAffected(input: {
  ecosystem: Affected['ecosystem'];
  package: string;
  versions: string;
  fixedIn?: string | undefined;
}): Affected {
  const a: Affected = {
    ecosystem: input.ecosystem,
    package: input.package,
    versions: input.versions || 'any',
  };
  if (input.fixedIn) a.fixedIn = input.fixedIn;
  return a;
}

export function normalizeVuln(input: unknown): VulnT | null {
  const r = Vuln.safeParse(input);
  return r.success ? r.data : null;
}

export function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

export function toIsoDate(d: string | number | Date | undefined | null): string {
  if (!d) return new Date(0).toISOString();
  try {
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return new Date(0).toISOString();
    return date.toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}
