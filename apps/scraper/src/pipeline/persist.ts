import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Stack } from '@sec/shared';

// Vulnerability data and per-run state now live in the database (@sec/db).
// The only file-backed input left is stack.json — hand-edited tech-stack config.
export interface DataPaths {
  root: string;
  stack: string;
}

export function buildPaths(root: string): DataPaths {
  return { root, stack: join(root, 'stack.json') };
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

export function loadStack(paths: DataPaths): Stack {
  return loadJson<Stack>(paths.stack, { frontend: {}, backend: {}, tools: {} });
}
