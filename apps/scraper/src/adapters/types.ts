import type { Cadence, Vuln } from '@sec/shared';

export interface SourceCursor {
  lastFetchedAt?: string | undefined;
  lastCursor?: string | undefined;
}

export interface FetchResult {
  raw: unknown[];
  nextCursor?: string | undefined;
}

export type SourceKind = 'advisory' | 'changelog' | 'news' | 'research' | 'alert';

export interface Adapter {
  id: string;
  kind: SourceKind;
  cadence: Cadence;
  fetch(cursor: SourceCursor): Promise<FetchResult>;
  normalize(raw: unknown): Vuln | null;
}

export type EnrichResult = {
  modifiedById: Map<string, Partial<Vuln>>;
  addedVulns?: Vuln[];
};

export interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction?: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
}

export interface EnrichContext {
  /** Prefetched CISA KEV feed. Shared so the KEV enricher doesn't refetch and
   *  main can derive the incremental-load keys from the same data. */
  kevEntries?: KevEntry[];
}

export interface Enricher {
  id: string;
  cadence: Cadence;
  enrich(vulns: Vuln[], ctx?: EnrichContext): Promise<EnrichResult>;
}
