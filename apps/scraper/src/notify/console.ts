import type { Vuln } from '@sec/shared';
import { buildCard } from './teams.js';

export interface NotifyResult {
  ok: boolean;
  error?: string;
}

export function sendConsole(vuln: Vuln, prefix = ''): NotifyResult {
  const card = buildCard(vuln, prefix);
  console.warn('--- ALERT ---');
  console.warn(JSON.stringify(card, null, 2));
  return { ok: true };
}
