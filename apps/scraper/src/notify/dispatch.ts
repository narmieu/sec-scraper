import { SCORING_CONFIG, type AlertEntry, type AlertedFile, type Vuln } from '@sec/shared';
import { getClient, migrateSchema, loadAlerted, saveAlerted, type Client } from '@sec/db';
import { sendTeams } from './teams.js';
import { sendConsole } from './console.js';

export interface DispatchResult {
  alertsFired: number;
}

export interface AlertTestResult {
  dispatched: boolean;
}

interface PendingAlert {
  vuln: Vuln;
  prefix: string;
  isKevFollowup: boolean;
}

export async function dispatchAlerts(
  vulns: Vuln[],
  alerted: AlertedFile,
  db: Client,
  now: Date,
): Promise<DispatchResult> {
  const pending = pickAlerts(vulns, alerted, now);
  if (pending.length === 0) return { alertsFired: 0 };

  const webhook = process.env['TEAMS_WEBHOOK_URL'];
  const channels: string[] = webhook ? ['teams'] : ['console'];

  for (const p of pending) {
    const prior = alerted[p.vuln.id];
    const entry: AlertEntry = prior
      ? {
          ...prior,
          ...(p.isKevFollowup ? { kevAlertedAt: now.toISOString() } : {}),
          channels: Object.fromEntries(channels.map((c) => [c, 'pending'])),
        }
      : {
          alertedAt: now.toISOString(),
          channels: Object.fromEntries(channels.map((c) => [c, 'pending'])),
          vulnSnapshot: {
            priority: p.vuln.priority,
            kev: p.vuln.kev,
            severity: p.vuln.severity,
          },
        };
    alerted[p.vuln.id] = entry;
  }
  await saveAlerted(db, alerted);

  for (const p of pending) {
    const entry = alerted[p.vuln.id]!;
    if (webhook) {
      const r = await sendTeams(p.vuln, webhook, p.prefix);
      entry.channels['teams'] = r.ok ? 'ok' : `fail:${r.error ?? 'unknown'}`;
    } else {
      const r = sendConsole(p.vuln, p.prefix);
      entry.channels['console'] = r.ok ? 'ok' : 'fail';
    }
  }
  await saveAlerted(db, alerted);

  return { alertsFired: pending.length };
}

export function pickAlerts(vulns: Vuln[], alerted: AlertedFile, now: Date): PendingAlert[] {
  const thresholds = SCORING_CONFIG.thresholds.push;
  const maxAgeMs = thresholds.maxAgeHours * 3_600_000;
  const out: PendingAlert[] = [];
  for (const v of vulns) {
    // A withdrawn/retracted advisory is never actionable — never alert it,
    // whatever its severity, KEV status, or prior failed-channel entry.
    if (v.withdrawn) continue;
    const meetsBar = v.priority >= thresholds.priority && v.stackMatch.score >= thresholds.stackMatch;
    if (!meetsBar) continue;
    // Freshness gate: only (re-)alert a vuln published within the window. KEV
    // bypasses it — active exploitation is age-independent. Applies to first-time
    // pushes AND failed-channel retries, so a stale backlog item never alerts.
    const fresh = now.getTime() - new Date(v.publishedAt).getTime() <= maxAgeMs;
    const prior = alerted[v.id];
    if (!prior) {
      if (fresh || v.kev) out.push({ vuln: v, prefix: '', isKevFollowup: false });
      continue;
    }
    if (v.kev && !prior.vulnSnapshot.kev && !prior.kevAlertedAt) {
      out.push({ vuln: v, prefix: '[KEV] ', isKevFollowup: true });
      continue;
    }
    const allOk = Object.values(prior.channels).every((s) => s === 'ok');
    if (!allOk && (fresh || v.kev)) {
      out.push({ vuln: v, prefix: '', isKevFollowup: false });
    }
  }
  return out;
}

export async function runAlertTest(dryRun: boolean): Promise<AlertTestResult> {
  const now = new Date();
  const iso = now.toISOString();
  const staleIso = new Date(now.getTime() - 365 * 86_400_000).toISOString();

  const fake = (over: Partial<Vuln>): Vuln => ({
    id: 'CVE-TEST',
    aliases: [],
    title: 'Test vulnerability',
    summary: 'Synthetic alert produced by `pnpm scrape --alert-test`.',
    severity: 'critical',
    cvss: 9.8,
    kev: false,
    ecosystems: ['npm'],
    cwe: ['CWE-89'],
    affected: [{ ecosystem: 'npm', package: 'next', versions: '<14.2.36', fixedIn: '14.2.36' }],
    stackMatch: { score: 100, packages: ['next'], reason: 'direct-dep' },
    priority: 95,
    publishedAt: iso,
    modifiedAt: iso,
    mergedAt: iso,
    sources: [{ source: 'cli', externalId: 'alert-test', url: 'https://example.com/alert-test', fetchedAt: iso }],
    tags: ['frontend', 'nextjs'],
    ...over,
  });

  // Drive the real notification path (dispatchAlerts -> pickAlerts -> send) so
  // the test exercises gating, not just transport. Exactly one should notify;
  // the other two are negative controls for the withdrawn filter and the
  // freshness gate. If either control arrives, a gate has regressed.
  const fakes: Vuln[] = [
    fake({ id: 'CVE-TEST-LIVE', cveId: 'CVE-TEST-LIVE', kev: true, title: 'TEST critical — SHOULD ALERT (fresh, in-scope)' }),
    fake({ id: 'CVE-TEST-WITHDRAWN', cveId: 'CVE-TEST-WITHDRAWN', withdrawn: true, title: 'TEST withdrawn — should NOT alert' }),
    fake({ id: 'CVE-TEST-STALE', cveId: 'CVE-TEST-STALE', publishedAt: staleIso, modifiedAt: staleIso, title: 'TEST stale non-KEV — should NOT alert' }),
  ];

  if (dryRun) {
    const picked = pickAlerts(fakes, {}, now);
    console.warn(
      `alert-test (dry-run): ${picked.length}/3 would notify -> ${picked.map((p) => p.vuln.id).join(', ') || 'none'}`,
    );
    for (const p of picked) sendConsole(p.vuln, p.prefix);
    return { dispatched: picked.length === 1 && picked[0]!.vuln.id === 'CVE-TEST-LIVE' };
  }

  const db = getClient();
  await migrateSchema(db);
  const alerted = await loadAlerted(db);
  for (const f of fakes) delete alerted[f.id]; // fresh state so re-runs are predictable
  const res = await dispatchAlerts(fakes, alerted, db, now);

  const legit = alerted['CVE-TEST-LIVE'];
  const delivered = !!legit && Object.values(legit.channels).every((s) => s === 'ok');
  const suppressed = !alerted['CVE-TEST-WITHDRAWN'] && !alerted['CVE-TEST-STALE'];
  if (!delivered) {
    console.error(`alert-test: legit alert did not deliver — channels=${JSON.stringify(legit?.channels)}`);
  }
  if (!suppressed) {
    console.error('alert-test: a negative control was notified — gate regressed');
  }
  console.warn(`alert-test: fired ${res.alertsFired}/3 (expected 1: CVE-TEST-LIVE)`);
  return { dispatched: delivered && suppressed && res.alertsFired === 1 };
}
