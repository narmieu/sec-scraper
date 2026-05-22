import type { Cadence, Vuln } from '@sec/shared';

export interface SourceCursor {
  lastFetchedAt?: string | undefined;
  lastCursor?: string | undefined;
}

export interface FetchResult {
  raw: unknown[];
  nextCursor?: string | undefined;
}

export interface Adapter {
  id: string;
  cadence: Cadence;
  fetch(cursor: SourceCursor): Promise<FetchResult>;
  normalize(raw: unknown): Vuln | null;
}

export type EnrichResult = {
  modifiedById: Map<string, Partial<Vuln>>;
  addedVulns?: Vuln[];
};

export interface Enricher {
  id: string;
  cadence: Cadence;
  enrich(vulns: Vuln[]): Promise<EnrichResult>;
}
