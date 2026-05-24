import { z } from 'zod';
import { ECOSYSTEMS, SEVERITIES, TAGS } from './constants';

export const Severity = z.enum(SEVERITIES);
export type Severity = z.infer<typeof Severity>;

export const Ecosystem = z.enum(ECOSYSTEMS);
export type Ecosystem = z.infer<typeof Ecosystem>;

export const Tag = z.enum(TAGS);
export type Tag = z.infer<typeof Tag>;

export const SourceRef = z.object({
  source: z.string(),
  externalId: z.string(),
  url: z.string().url(),
  fetchedAt: z.string().datetime(),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const StackMatchReason = z.enum(['direct-dep', 'transitive', 'framework', 'topic-mention']);
export type StackMatchReason = z.infer<typeof StackMatchReason>;

export const StackMatch = z.object({
  score: z.number().min(0).max(100),
  packages: z.array(z.string()),
  reason: StackMatchReason,
});
export type StackMatch = z.infer<typeof StackMatch>;

export const Affected = z.object({
  ecosystem: Ecosystem,
  package: z.string(),
  versions: z.string(),
  fixedIn: z.string().optional(),
});
export type Affected = z.infer<typeof Affected>;

export const Vuln = z.object({
  id: z.string(),
  cveId: z.string().optional(),
  ghsaId: z.string().optional(),
  aliases: z.array(z.string()),

  title: z.string(),
  summary: z.string(),
  details: z.string().max(4000).optional(),

  severity: Severity,
  cvss: z.number().min(0).max(10).optional(),
  cvssVector: z.string().optional(),
  epss: z.number().min(0).max(1).optional(),
  kev: z.boolean().default(false),
  ecosystems: z.array(Ecosystem),
  cwe: z.array(z.string()),

  affected: z.array(Affected),

  stackMatch: StackMatch,
  priority: z.number().min(0).max(100),

  publishedAt: z.string().datetime(),
  modifiedAt: z.string().datetime(),
  mergedAt: z.string().datetime(),

  sources: z.array(SourceRef).min(1),
  tags: z.array(Tag),
});
export type Vuln = z.infer<typeof Vuln>;

export const SourceHealth = z.object({
  consecutiveFailures: z.number().int().nonnegative(),
  lastSuccess: z.string().datetime().optional(),
  lastError: z.string().optional(),
  state: z.enum(['closed', 'open', 'half-open']),
  reopenAt: z.string().datetime().optional(),
  lastFetchedAt: z.string().datetime().optional(),
  lastCursor: z.string().optional(),
});
export type SourceHealth = z.infer<typeof SourceHealth>;

export const SourcesFile = z.record(z.string(), SourceHealth);
export type SourcesFile = z.infer<typeof SourcesFile>;

export const AlertEntry = z.object({
  alertedAt: z.string().datetime(),
  kevAlertedAt: z.string().datetime().optional(),
  channels: z.record(z.string(), z.string()),
  vulnSnapshot: z.object({
    priority: z.number(),
    kev: z.boolean(),
    severity: Severity,
  }),
});
export type AlertEntry = z.infer<typeof AlertEntry>;

export const AlertedFile = z.record(z.string(), AlertEntry);
export type AlertedFile = z.infer<typeof AlertedFile>;

export const RunSourceStat = z.object({
  ok: z.boolean(),
  fetched: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  attempts: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative(),
});
export type RunSourceStat = z.infer<typeof RunSourceStat>;

export const LastRun = z.object({
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  stats: z.object({
    newCount: z.number().int().nonnegative(),
    updatedCount: z.number().int().nonnegative(),
    archivedCount: z.number().int().nonnegative().default(0),
    droppedCount: z.number().int().nonnegative(),
    filteredCount: z.number().int().nonnegative().default(0),
    alertCount: z.number().int().nonnegative(),
  }),
  sources: z.record(z.string(), RunSourceStat),
  errors: z.array(
    z.object({
      source: z.string(),
      phase: z.enum(['fetch', 'parse', 'normalize', 'persist', 'notify']),
      message: z.string(),
      stack: z.string().optional(),
    }),
  ),
});
export type LastRun = z.infer<typeof LastRun>;

export const Stack = z.object({
  frontend: z.record(z.string(), z.string()),
  backend: z.record(z.string(), z.string()),
  tools: z.record(z.string(), z.string()),
});
export type Stack = z.infer<typeof Stack>;
