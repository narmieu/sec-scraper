import type { Ecosystem, ExploitMaturity, ExposureStatus, Severity, StackMatch, Tag, Vuln } from './schemas';

export interface IndexEntry {
  id: string;
  cveId?: string;
  ghsaId?: string;
  title: string;
  severity: Severity;
  cvss?: number;
  kev: boolean;
  priority: number;
  ecosystems: Ecosystem[];
  tags: Tag[];
  sources: string[];
  stackMatch: StackMatch;
  exposure?: { status: ExposureStatus; fixedIn?: string };
  publishedAt: string;
  modifiedAt: string;
  summary: string;
  affectedPackages: string[];
  exploitMaturity?: ExploitMaturity;
  patchAvailable: boolean;
}

const SUMMARY_MAX = 160;
// Titles can now be the full description (NVD/CVE entries have no real title), so
// cap what goes into the compact index. The list line-clamps and the detail view
// reads the full title from the per-vuln shard, so this only bounds index size.
const TITLE_MAX = 200;

export function toIndexEntry(v: Vuln): IndexEntry {
  const entry: IndexEntry = {
    id: v.id,
    title: v.title.length > TITLE_MAX ? v.title.slice(0, TITLE_MAX) : v.title,
    severity: v.severity,
    kev: v.kev,
    priority: v.priority,
    ecosystems: v.ecosystems,
    tags: v.tags,
    sources: [...new Set(v.sources.map((s) => s.source))],
    stackMatch: v.stackMatch,
    publishedAt: v.publishedAt,
    modifiedAt: v.modifiedAt,
    summary: v.summary.length > SUMMARY_MAX ? v.summary.slice(0, SUMMARY_MAX) : v.summary,
    affectedPackages: [...new Set(v.affected.map((a) => a.package))],
    patchAvailable: false,
  };
  if (v.cveId) entry.cveId = v.cveId;
  if (v.ghsaId) entry.ghsaId = v.ghsaId;
  if (v.cvss !== undefined) entry.cvss = v.cvss;
  if (v.exposure && v.exposure.status !== 'unknown') {
    entry.exposure = v.exposure.fixedIn
      ? { status: v.exposure.status, fixedIn: v.exposure.fixedIn }
      : { status: v.exposure.status };
  }
  entry.patchAvailable = v.affected.some((a) => a.fixedIn);
  const maturity = v.exploit?.maturity ?? (v.kev ? 'active' : 'none');
  if (maturity !== 'none') entry.exploitMaturity = maturity;
  return entry;
}
