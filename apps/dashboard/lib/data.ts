import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AlertedFile, LastRun, SourcesFile } from '@sec/shared';

// Source health, last-run, and the alert log are emitted to public/data/status.json
// by the prebuild step (scripts/build-index.ts) from the database. These accessors
// run at build time (static export) and read that snapshot — the dashboard bundle
// never touches the database directly.
interface StatusFile {
  sources: SourcesFile;
  lastRun: LastRun | null;
  alerted: AlertedFile;
}

const STATUS_PATH = join(process.cwd(), 'public', 'data', 'status.json');
const EMPTY: StatusFile = { sources: {}, lastRun: null, alerted: {} };

let cached: StatusFile | null = null;

function loadStatus(): StatusFile {
  if (cached) return cached;
  if (!existsSync(STATUS_PATH)) return (cached = EMPTY);
  try {
    cached = JSON.parse(readFileSync(STATUS_PATH, 'utf8')) as StatusFile;
  } catch {
    cached = EMPTY;
  }
  return cached;
}

export function loadSourceHealth(): SourcesFile {
  return loadStatus().sources;
}

export function loadLastRun(): LastRun | null {
  return loadStatus().lastRun;
}

export function loadAlertedFile(): AlertedFile {
  return loadStatus().alerted;
}
