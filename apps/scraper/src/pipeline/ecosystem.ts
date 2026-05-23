import type { Ecosystem } from '@sec/shared';

const ECO_MAP: Record<string, Ecosystem> = {
  npm: 'npm',
  packagist: 'composer',
  composer: 'composer',
  pip: 'pypi',
  pypi: 'pypi',
};

export function mapEcosystem(raw: string | undefined): Ecosystem {
  if (!raw) return 'generic';
  return ECO_MAP[raw.toLowerCase()] ?? 'generic';
}
