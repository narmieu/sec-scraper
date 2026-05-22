import { SCORING_CONFIG, type AlertEntry, type AlertedFile, type Vuln } from '@sec/shared';
import { canonicalId } from '../pipeline/normalize.js';
import {
  buildPaths,
  loadAlerted,
  writeAlerted,
  type DataPaths,
} from '../pipeline/persist.js';
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
  paths: DataPaths,
  now: Date,
): Promise<DispatchResult> {
  const pending = pickAlerts(vulns, alerted);
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
  writeAlerted(paths, alerted);

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
  writeAlerted(paths, alerted);

  return { alertsFired: pending.length };
}

function pickAlerts(vulns: Vuln[], alerted: AlertedFile): PendingAlert[] {
  const thresholds = SCORING_CONFIG.thresholds.push;
  const out: PendingAlert[] = [];
  for (const v of vulns) {
    const meetsBar = v.priority >= thresholds.priority && v.stackMatch.score >= thresholds.stackMatch;
    if (!meetsBar) continue;
    const prior = alerted[v.id];
    if (!prior) {
      out.push({ vuln: v, prefix: '', isKevFollowup: false });
      continue;
    }
    if (v.kev && !prior.vulnSnapshot.kev && !prior.kevAlertedAt) {
      out.push({ vuln: v, prefix: '[KEV] ', isKevFollowup: true });
      continue;
    }
    const allOk = Object.values(prior.channels).every((s) => s === 'ok');
    if (!allOk) {
      out.push({ vuln: v, prefix: '', isKevFollowup: false });
    }
  }
  return out;
}

export async function runAlertTest(dataRoot: string, dryRun: boolean): Promise<AlertTestResult> {
  const now = new Date();
  const fake: Vuln = {
    id: canonicalId({ cveId: 'CVE-TEST-1' }),
    cveId: 'CVE-TEST-1',
    aliases: ['CVE-TEST-1'],
    title: 'Test critical vulnerability (alert pipeline check)',
    summary: 'This is a synthetic alert produced by `pnpm scrape --alert-test`.',
    severity: 'critical',
    cvss: 9.8,
    kev: true,
    ecosystems: ['npm'],
    cwe: ['CWE-89'],
    affected: [
      {
        ecosystem: 'npm',
        package: 'next',
        versions: '<14.2.36',
        fixedIn: '14.2.36',
      },
    ],
    stackMatch: { score: 100, packages: ['next'], reason: 'direct-dep' },
    priority: 95,
    publishedAt: now.toISOString(),
    modifiedAt: now.toISOString(),
    mergedAt: now.toISOString(),
    sources: [
      {
        source: 'cli',
        externalId: 'alert-test',
        url: 'https://example.com/alert-test',
        fetchedAt: now.toISOString(),
      },
    ],
    tags: ['frontend', 'nextjs'],
  };

  if (dryRun) {
    sendConsole(fake);
    return { dispatched: true };
  }

  const webhook = process.env['TEAMS_WEBHOOK_URL'];
  if (webhook) {
    const r = await sendTeams(fake, webhook);
    if (!r.ok) {
      console.error(`alert-test failed: ${r.error}`);
      return { dispatched: false };
    }
  } else {
    sendConsole(fake);
  }

  const paths = buildPaths(dataRoot);
  const alerted = loadAlerted(paths);
  alerted[fake.id] = {
    alertedAt: now.toISOString(),
    channels: { [webhook ? 'teams' : 'console']: 'ok' },
    vulnSnapshot: { priority: fake.priority, kev: fake.kev, severity: fake.severity },
  };
  writeAlerted(paths, alerted);
  return { dispatched: true };
}
