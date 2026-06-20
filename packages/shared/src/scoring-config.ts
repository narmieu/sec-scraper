export const SCORING_CONFIG = {
  weights: { severity: 40, stackMatch: 35, exploit: 15, freshness: 10 },
  thresholds: { push: { priority: 80, stackMatch: 60 } },
  decay: { halfLifeDays: 30 },
  floors: { kev: 85, affected: 75 },
  demoteWhenIrrelevantFactor: 0.4,
  demoteWhenSafeFactor: 0.25,
  exploitMaturity: { active: 20, weaponized: 16, poc: 10 },
  noPatchAffectedBump: 8,
} as const;
