import { Stack, buildStackIndex, type Stack as StackT, type StackIndex } from '@sec/shared';
import { loadStack, type DataPaths } from '@/pipeline/persist.js';
import { buildStackTargets, type StackTargets } from '@/pipeline/stack-targets.js';

const EMPTY_STACK: StackT = { frontend: {}, backend: {}, tools: {} };

export interface LoadedStack {
  stack: StackT;
  index: StackIndex;
  targets: StackTargets;
}

export function loadStackBundle(paths: DataPaths): LoadedStack {
  const raw = loadStack(paths);
  const parsed = Stack.safeParse(raw);
  const stack = parsed.success ? parsed.data : EMPTY_STACK;
  return {
    stack,
    index: buildStackIndex(stack),
    targets: buildStackTargets(stack),
  };
}

export function loadStackIndex(paths: DataPaths): StackIndex {
  return loadStackBundle(paths).index;
}
