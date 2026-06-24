export const SCORING_CONFIG = {
  weights: { severity: 40, stackMatch: 35, exploit: 15, freshness: 10 },
  // maxAgeHours: a push only fires if the vuln was published within this window.
  // Stops stale backlog (e.g. old CVEs newly matching a rebuilt stack manifest)
  // from alerting. Applies to first-time pushes AND failed-channel retries, so a
  // stale item can never (re-)alert. KEV bypasses it everywhere (first-time,
  // retry, follow-up) — active exploitation is age-independent.
  thresholds: { push: { priority: 80, stackMatch: 60, maxAgeHours: 48 } },
  decay: { halfLifeDays: 30 },
  floors: { kev: 85, affected: 75 },
  demoteWhenIrrelevantFactor: 0.4,
  demoteWhenSafeFactor: 0.25,
  exploitMaturity: { active: 20, weaponized: 16, poc: 10 },
  noPatchAffectedBump: 8,
} as const;
