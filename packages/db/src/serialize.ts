import { Vuln } from '@sec/shared';
import type { Row, Value } from '@libsql/client';

export const VULN_COLUMNS = [
  'id', 'cve_id', 'ghsa_id', 'title', 'summary', 'details', 'severity', 'cvss',
  'cvss_vector', 'epss', 'kev', 'withdrawn', 'priority', 'exploit_maturity', 'exposure_status',
  'published_at', 'modified_at', 'merged_at', 'aliases', 'ecosystems', 'cwe',
  'tags', 'affected', 'stack_match', 'exposure', 'exploit', 'sources',
] as const;

export type VulnColumn = (typeof VULN_COLUMNS)[number];
export type RowValues = Record<VulnColumn, string | number | null>;

/** Vuln → flat DB row. Scalars map to columns; nested data is JSON-encoded;
 *  exploit maturity and exposure status are denormalized into their own columns
 *  so the dashboard can query/sort on them. */
export function vulnToRow(v: Vuln): RowValues {
  return {
    id: v.id,
    cve_id: v.cveId ?? null,
    ghsa_id: v.ghsaId ?? null,
    title: v.title,
    summary: v.summary,
    details: v.details ?? null,
    severity: v.severity,
    cvss: v.cvss ?? null,
    cvss_vector: v.cvssVector ?? null,
    epss: v.epss ?? null,
    kev: v.kev ? 1 : 0,
    withdrawn: v.withdrawn ? 1 : 0,
    priority: v.priority,
    exploit_maturity: v.exploit?.maturity ?? null,
    exposure_status: v.exposure?.status ?? null,
    published_at: v.publishedAt,
    modified_at: v.modifiedAt,
    merged_at: v.mergedAt,
    aliases: JSON.stringify(v.aliases),
    ecosystems: JSON.stringify(v.ecosystems),
    cwe: JSON.stringify(v.cwe),
    tags: JSON.stringify(v.tags),
    affected: JSON.stringify(v.affected),
    stack_match: JSON.stringify(v.stackMatch),
    exposure: v.exposure ? JSON.stringify(v.exposure) : null,
    exploit: v.exploit ? JSON.stringify(v.exploit) : null,
    sources: JSON.stringify(v.sources),
  };
}

const optText = (v: Value | undefined): string | undefined => (v == null ? undefined : String(v));
const optNum = (v: Value | undefined): number | undefined => (v == null ? undefined : Number(v));
const parseJson = <T>(v: Value | undefined): T => JSON.parse(String(v)) as T;

/** DB row → Vuln, re-validated through the shared Zod schema. The denormalized
 *  `exploit_maturity` / `exposure_status` columns are derived data and ignored
 *  here — the JSON columns are the source of truth on read. */
export function rowToVuln(row: Row): Vuln {
  return Vuln.parse({
    id: String(row.id),
    cveId: optText(row.cve_id),
    ghsaId: optText(row.ghsa_id),
    aliases: parseJson(row.aliases),
    title: String(row.title),
    summary: String(row.summary),
    details: optText(row.details),
    severity: String(row.severity),
    cvss: optNum(row.cvss),
    cvssVector: optText(row.cvss_vector),
    epss: optNum(row.epss),
    kev: Boolean(row.kev),
    // Absent (not `false`) when not withdrawn, so a normal advisory round-trips
    // to an unset optional rather than an explicit flag.
    withdrawn: row.withdrawn ? true : undefined,
    ecosystems: parseJson(row.ecosystems),
    cwe: parseJson(row.cwe),
    affected: parseJson(row.affected),
    stackMatch: parseJson(row.stack_match),
    exposure: row.exposure == null ? undefined : parseJson(row.exposure),
    exploit: row.exploit == null ? undefined : parseJson(row.exploit),
    priority: Number(row.priority),
    publishedAt: String(row.published_at),
    modifiedAt: String(row.modified_at),
    mergedAt: String(row.merged_at),
    sources: parseJson(row.sources),
    tags: parseJson(row.tags),
  });
}
