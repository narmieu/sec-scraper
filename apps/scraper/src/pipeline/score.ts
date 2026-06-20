import { SCORING_CONFIG } from '@sec/shared';
import type { Severity, Vuln } from '@sec/shared';

const SEVERITY_BASE: Record<Severity, number> = {
  critical: 40,
  high: 30,
  medium: 15,
  low: 5,
  unknown: 10,
};

export interface ScoreBreakdown {
  severityBase: number;
  stackMatch: number;
  exploit: number;
  freshness: number;
  total: number;
  floorApplied?: 'kev' | 'ai-llm' | 'affected';
  demoted: boolean;
}

export function computePriority(vuln: Vuln): number {
  return scoreWithBreakdown(vuln).total;
}

export function scoreWithBreakdown(vuln: Vuln): ScoreBreakdown {
  const severityBase = SEVERITY_BASE[vuln.severity];
  const status = vuln.exposure?.status ?? 'unknown';
  const stackMatch = vuln.stackMatch.score * (SCORING_CONFIG.weights.stackMatch / 100);

  const maturity = vuln.exploit?.maturity ?? (vuln.kev ? 'active' : 'none');
  let exploit = 0;
  if (maturity === 'active') exploit = SCORING_CONFIG.exploitMaturity.active;
  else if (maturity === 'weaponized') exploit = SCORING_CONFIG.exploitMaturity.weaponized;
  else if (maturity === 'poc') exploit = SCORING_CONFIG.exploitMaturity.poc;
  else if (vuln.epss !== undefined && vuln.epss > 0.5) exploit = 8;
  else if (vuln.epss !== undefined && vuln.epss > 0.1) exploit = 4;

  const ageDays = Math.max(
    0,
    (Date.now() - new Date(vuln.publishedAt).getTime()) / 86_400_000,
  );
  let freshness = 0;
  if (ageDays < 7) freshness = 10;
  else if (ageDays < 30) freshness = 5;
  else if (ageDays < 90) freshness = 2;

  let total = severityBase + stackMatch + exploit + freshness;
  const patchAvailable = vuln.affected.some((a) => a.fixedIn);
  if (status === 'affected' && !patchAvailable) total += SCORING_CONFIG.noPatchAffectedBump;
  let demoted = false;
  let floorApplied: ScoreBreakdown['floorApplied'];

  const isAiLlm = vuln.tags.includes('ai-llm');
  if (vuln.stackMatch.score === 0 && !isAiLlm) {
    total *= SCORING_CONFIG.demoteWhenIrrelevantFactor;
    demoted = true;
  }

  if (status === 'safe') {
    total *= SCORING_CONFIG.demoteWhenSafeFactor;
    demoted = true;
  }

  if (vuln.kev) {
    total = Math.max(total, SCORING_CONFIG.floors.kev);
    floorApplied = 'kev';
  }

  if (status === 'affected' && (vuln.severity === 'critical' || vuln.severity === 'high')) {
    total = Math.max(total, SCORING_CONFIG.floors.affected);
    floorApplied = floorApplied ?? 'affected';
  }

  if (isAiLlm) {
    if (vuln.stackMatch.score > total) {
      total = vuln.stackMatch.score;
      floorApplied = 'ai-llm';
    }
  }

  total = Math.max(0, Math.min(100, Math.round(total)));

  return { severityBase, stackMatch, exploit, freshness, total, demoted, ...(floorApplied ? { floorApplied } : {}) };
}
