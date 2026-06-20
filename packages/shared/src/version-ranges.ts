import semver from 'semver';
import type { Ecosystem } from './schemas';

export type RangeVerdict = 'in' | 'out' | 'partial' | 'unknown';

/**
 * Translate an advisory/constraint range into a semver-valid range string.
 * - comma means AND (advisory convention): ">=1.0, <2.0" -> ">=1.0 <2.0"
 * - "||" means OR (preserved)
 * - "any"/""/"*" -> "*"
 * Composer operators (^ ~ * .x hyphen) are already valid semver range syntax.
 * Returns null when the result is not a valid semver range.
 */
export function toSemverRange(range: string): string | null {
  const r = (range ?? '').trim();
  if (!r || r.toLowerCase() === 'any' || r === '*') return '*';
  const candidate = r
    .split('||')
    .map((or) =>
      or
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join(' || ');
  return semver.validRange(candidate, { loose: true }) ? candidate : null;
}

/**
 * Decide whether an installed version/constraint falls inside a vulnerable range.
 * Only npm and Composer map onto semver range semantics; other ecosystems return
 * 'unknown' (the caller treats a name match as 'potential'). Unversioned '*'
 * installs return 'in'/'partial' regardless of ecosystem.
 */
export function evaluateRange(
  ecosystem: Ecosystem,
  installed: string,
  vulnerable: string,
): RangeVerdict {
  const vulnRange = toSemverRange(vulnerable);
  if (vulnRange === null) return 'unknown';

  // Unversioned tracking (e.g. tools pinned to "*"): cannot rule ourselves out,
  // regardless of ecosystem.
  if (installed === '*' || installed.toLowerCase() === 'any') {
    return vulnRange === '*' ? 'in' : 'partial';
  }

  // Only npm and Composer versions map onto semver range semantics. Other
  // ecosystems (pypi/generic/ai-llm/infrastructure) have no reliable semver
  // ordering, so we cannot decide a range verdict.
  if (ecosystem !== 'npm' && ecosystem !== 'composer') return 'unknown';

  // Installed pinned to a concrete version (typical npm): decide precisely.
  if (semver.valid(installed)) {
    return semver.satisfies(installed, vulnRange, { includePrerelease: true }) ? 'in' : 'out';
  }

  // Installed is itself a constraint (typical Composer "^6.4").
  const instRange = toSemverRange(installed);
  if (instRange === null) return 'unknown';
  try {
    // Entire installed range lies within the vulnerable range → definitely affected.
    if (semver.subset(instRange, vulnRange, { loose: true })) return 'in';
    // Otherwise: overlap → can't prove (partial); disjoint → safe (out).
    return semver.intersects(instRange, vulnRange, { loose: true }) ? 'partial' : 'out';
  } catch {
    return 'unknown';
  }
}
