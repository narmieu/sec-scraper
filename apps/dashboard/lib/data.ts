import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AlertedFile, LastRun, SourcesFile, Vuln } from '@sec/shared';

const DATA_DIR = join(process.cwd(), '..', '..', 'data');

function readJson<T>(file: string, fallback: T): T {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function loadAllVulns(): Vuln[] {
  return readJson<Vuln[]>('vulns.json', []);
}

export function loadSourceHealth(): SourcesFile {
  return readJson<SourcesFile>('sources.json', {});
}

export function loadLastRun(): LastRun | null {
  return readJson<LastRun | null>('last-run.json', null);
}

export function loadAlertedFile(): AlertedFile {
  return readJson<AlertedFile>('alerted.json', {});
}
