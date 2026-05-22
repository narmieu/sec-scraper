import { Stack, buildStackIndex, type StackIndex } from '@sec/shared';
import { loadStack, type DataPaths } from './pipeline/persist.js';

export function loadStackIndex(paths: DataPaths): StackIndex {
  const raw = loadStack(paths);
  const parsed = Stack.safeParse(raw);
  if (!parsed.success) {
    return buildStackIndex({ frontend: {}, backend: {}, tools: {} });
  }
  return buildStackIndex(parsed.data);
}
