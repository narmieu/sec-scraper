import type { IndexEntry } from '@sec/shared';

export type Category = 'frontend' | 'backend' | 'ai-llm';

export const CATEGORY_PREDICATES: Record<Category, (v: IndexEntry) => boolean> = {
  frontend: (v) => v.ecosystems.includes('npm') || v.tags.includes('frontend') || v.tags.includes('nextjs'),
  backend: (v) => v.ecosystems.includes('composer') || v.tags.includes('backend') || v.tags.includes('symfony'),
  'ai-llm': (v) => v.tags.includes('ai-llm') || v.ecosystems.includes('ai-llm'),
};
