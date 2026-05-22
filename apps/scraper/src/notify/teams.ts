import { fetch } from 'undici';
import type { Vuln } from '@sec/shared';

export interface TeamsCard {
  type: 'message';
  attachments: {
    contentType: 'application/vnd.microsoft.card.adaptive';
    content: AdaptiveCardContent;
  }[];
}

interface AdaptiveCardContent {
  $schema: string;
  type: 'AdaptiveCard';
  version: string;
  body: unknown[];
  actions?: unknown[];
}

const SEVERITY_COLOR: Record<Vuln['severity'], string> = {
  critical: 'Attention',
  high: 'Attention',
  medium: 'Warning',
  low: 'Accent',
  unknown: 'Default',
};

export function buildCard(vuln: Vuln, prefix = ''): TeamsCard {
  const id = vuln.cveId ?? vuln.ghsaId ?? vuln.id;
  const header = `${prefix}${vuln.severity.toUpperCase()} — ${id}`;
  const facts = [
    { title: 'Priority', value: String(vuln.priority) },
    ...(vuln.cvss !== undefined ? [{ title: 'CVSS', value: vuln.cvss.toFixed(1) }] : []),
    ...(vuln.epss !== undefined
      ? [{ title: 'EPSS', value: (vuln.epss * 100).toFixed(1) + '%' }]
      : []),
    ...(vuln.kev ? [{ title: 'KEV', value: 'Yes' }] : []),
    ...(vuln.stackMatch.packages.length > 0
      ? [{ title: 'Affected stack', value: vuln.stackMatch.packages.join(', ') }]
      : []),
    { title: 'Published', value: relativeTime(vuln.publishedAt) },
  ];

  const actions = vuln.sources.slice(0, 3).map((s) => ({
    type: 'Action.OpenUrl',
    title: s.source,
    url: s.url,
  }));

  const card: AdaptiveCardContent = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        size: 'Medium',
        weight: 'Bolder',
        color: SEVERITY_COLOR[vuln.severity],
        text: header,
        wrap: true,
      },
      {
        type: 'TextBlock',
        weight: 'Bolder',
        text: vuln.title,
        wrap: true,
      },
      { type: 'FactSet', facts },
      {
        type: 'TextBlock',
        text: vuln.summary,
        wrap: true,
        isSubtle: true,
      },
    ],
    actions,
  };

  return {
    type: 'message',
    attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: card }],
  };
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const h = diff / 3_600_000;
  if (h < 1) return `${Math.round(diff / 60_000)}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export interface NotifyResult {
  ok: boolean;
  error?: string;
}

export async function sendTeams(vuln: Vuln, webhookUrl: string, prefix = ''): Promise<NotifyResult> {
  try {
    const card = buildCard(vuln, prefix);
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(card),
    });
    if (res.status === 200 || res.status === 202) return { ok: true };
    const text = await res.text().catch(() => '');
    return { ok: false, error: `HTTP ${res.status} ${text.slice(0, 200)}` };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
