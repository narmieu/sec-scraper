import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROLLING_WINDOW_DAYS } from '@sec/shared';
import type { AlertedFile, LastRun, SourcesFile, Stack, Vuln } from '@sec/shared';

export interface DataPaths {
  root: string;
  vulns: string;
  archiveDir: string;
  sources: string;
  alerted: string;
  lastRun: string;
  stack: string;
}

export function buildPaths(root: string): DataPaths {
  return {
    root,
    vulns: join(root, 'vulns.json'),
    archiveDir: join(root, 'archive'),
    sources: join(root, 'sources.json'),
    alerted: join(root, 'alerted.json'),
    lastRun: join(root, 'last-run.json'),
    stack: join(root, 'stack.json'),
  };
}

export function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    const raw = readFileSync(path, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadVulns(paths: DataPaths): Vuln[] {
  return loadJson<Vuln[]>(paths.vulns, []);
}

export function loadSources(paths: DataPaths): SourcesFile {
  return loadJson<SourcesFile>(paths.sources, {});
}

export function loadAlerted(paths: DataPaths): AlertedFile {
  return loadJson<AlertedFile>(paths.alerted, {});
}

export function loadStack(paths: DataPaths): Stack {
  return loadJson<Stack>(paths.stack, { frontend: {}, backend: {}, tools: {} });
}

export function atomicWriteJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
}

export interface PersistResult {
  liveCount: number;
  archivedCount: number;
}

export function persistVulns(paths: DataPaths, vulns: Vuln[], now = new Date()): PersistResult {
  const cutoff = now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000;
  const live: Vuln[] = [];
  const byMonth = new Map<string, Vuln[]>();

  for (const v of vulns) {
    const modTime = new Date(v.modifiedAt).getTime();
    if (modTime >= cutoff) {
      live.push(v);
    } else {
      const month = v.modifiedAt.slice(0, 7);
      const bucket = byMonth.get(month) ?? [];
      bucket.push(v);
      byMonth.set(month, bucket);
    }
  }

  live.sort((a, b) => b.priority - a.priority || b.publishedAt.localeCompare(a.publishedAt));
  atomicWriteJson(paths.vulns, live);

  if (byMonth.size > 0) {
    mkdirSync(paths.archiveDir, { recursive: true });
    for (const [month, items] of byMonth) {
      const archivePath = join(paths.archiveDir, `${month}.json.gz`);
      const existing = readArchive(archivePath);
      const merged = mergeArchive(existing, items);
      const gz = gzipSync(Buffer.from(JSON.stringify(merged), 'utf8'));
      const tmp = `${archivePath}.tmp.${process.pid}`;
      writeFileSync(tmp, gz);
      renameSync(tmp, archivePath);
    }
  }

  let archivedCount = 0;
  for (const arr of byMonth.values()) archivedCount += arr.length;
  return { liveCount: live.length, archivedCount };
}

function readArchive(path: string): Vuln[] {
  if (!existsSync(path)) return [];
  try {
    if (statSync(path).size === 0) return [];
    const buf = readFileSync(path);
    return JSON.parse(gunzipSync(buf).toString('utf8')) as Vuln[];
  } catch {
    return [];
  }
}

function mergeArchive(existing: Vuln[], incoming: Vuln[]): Vuln[] {
  const byId = new Map<string, Vuln>();
  for (const v of existing) byId.set(v.id, v);
  for (const v of incoming) byId.set(v.id, v);
  return [...byId.values()];
}

export function writeSources(paths: DataPaths, sources: SourcesFile): void {
  atomicWriteJson(paths.sources, sources);
}

export function writeAlerted(paths: DataPaths, alerted: AlertedFile): void {
  atomicWriteJson(paths.alerted, alerted);
}

export function writeLastRun(paths: DataPaths, lastRun: LastRun): void {
  atomicWriteJson(paths.lastRun, lastRun);
}
