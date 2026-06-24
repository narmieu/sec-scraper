import semver from 'semver';
import type { Ecosystem, Exposure, ExposureStatus, StackMatch, Vuln } from './schemas';
import type { StackIndex } from './stack-matcher';
import { evaluateRange } from './version-ranges';

const STATUS_RANK: Record<ExposureStatus, number> = {
  affected: 3,
  potential: 2,
  safe: 1,
  unknown: 0,
};

export function evaluateExposure(
  vuln: Vuln,
  idx: StackIndex,
): { exposure: Exposure; stackMatch: StackMatch } {
  let best: Exposure = { status: 'unknown' };
  const matched: string[] = [];

  for (const aff of vuln.affected) {
    const key = aff.package.toLowerCase();
    const installedVersions = idx.byName.get(key);
    if (installedVersions === undefined || installedVersions.length === 0) continue;
    const original = idx.originalCase.get(key) ?? aff.package;
    matched.push(original);

    // A package may run at several versions across our services (e.g. antd v4 in
    // one app, v6 in another). Treat it as affected if ANY installed version is in
    // range; keep the worst verdict and record the version that triggered it.
    for (const installed of installedVersions) {
      const status = classify(aff.ecosystem, installed, aff.versions, aff.fixedIn);
      if (STATUS_RANK[status] > STATUS_RANK[best.status]) {
        best = {
          status,
          package: original,
          ecosystem: aff.ecosystem,
          installed,
          vulnerableRange: aff.versions,
          ...(aff.fixedIn ? { fixedIn: aff.fixedIn } : {}),
        };
      }
    }
  }

  if (best.status !== 'unknown') {
    const score = best.status === 'affected' ? 100 : best.status === 'potential' ? 60 : 20;
    return {
      exposure: best,
      stackMatch: { score, packages: [...new Set(matched)], reason: 'direct-dep' },
    };
  }

  // No structured affected entry named a stack dep — fall back to topic mention.
  const haystack = `${vuln.title}\n${vuln.summary}`.toLowerCase();
  const mentions: string[] = [];
  for (const name of idx.allLower) {
    if (name.length < 4) continue;
    if (haystack.includes(name)) mentions.push(idx.originalCase.get(name) ?? name);
  }
  if (mentions.length > 0) {
    return {
      exposure: { status: 'unknown' },
      stackMatch: { score: 40, packages: [...new Set(mentions)], reason: 'topic-mention' },
    };
  }
  return { exposure: { status: 'unknown' }, stackMatch: { score: 0, packages: [], reason: 'topic-mention' } };
}

function classify(
  ecosystem: Ecosystem,
  installed: string,
  vulnerable: string,
  fixedIn: string | undefined,
): ExposureStatus {
  const verdict = evaluateRange(ecosystem, installed, vulnerable);
  if (verdict === 'in') {
    if (fixedIn && isAtOrAbove(installed, fixedIn)) return 'safe';
    return 'affected';
  }
  if (verdict === 'out') return 'safe';
  return 'potential'; // 'partial' | 'unknown'
}

function isAtOrAbove(installed: string, fixedIn: string): boolean {
  const inst = semver.valid(installed) ? installed : semver.coerce(installed)?.version;
  const fix = semver.valid(fixedIn) ? fixedIn : semver.coerce(fixedIn)?.version;
  if (!inst || !fix) return false;
  return semver.gte(inst, fix);
}
