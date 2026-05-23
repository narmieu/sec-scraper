import type { Stack } from '@sec/shared';

export interface OsvQuery {
  name: string;
  ecosystem: 'npm' | 'Packagist';
}

export interface StackTargets {
  osvQueries: OsvQuery[];
  repoSlugs: string[];
  cveKeywords: string[];
  keywordRegex: RegExp;
}

const REPO_OVERRIDES: Record<string, string> = {
  next: 'vercel/next.js',
  react: 'facebook/react',
  'react-dom': 'facebook/react',
  '@apollo/client': 'apollographql/apollo-client',
  axios: 'axios/axios',
  lodash: 'lodash/lodash',
  antd: 'ant-design/ant-design',
  lexical: 'facebook/lexical',
  '@lexical/react': 'facebook/lexical',
  zustand: 'pmndrs/zustand',
  tailwindcss: 'tailwindlabs/tailwindcss',
  '@radix-ui/react-dialog': 'radix-ui/primitives',
  '@radix-ui/react-popover': 'radix-ui/primitives',
  '@sentry/nextjs': 'getsentry/sentry-javascript',
  firebase: 'firebase/firebase-js-sdk',
  tinymce: 'tinymce/tinymce',
  zod: 'colinhacks/zod',
  graphql: 'graphql/graphql-js',
  typescript: 'microsoft/TypeScript',
  'monolog/monolog': 'Seldaek/monolog',
};

const KEYWORD_OVERRIDES: Record<string, string[]> = {
  next: ['next.js', 'nextjs'],
  react: ['react '],
  'react-dom': ['react-dom'],
  '@apollo/client': ['apollo client', 'apollo-client'],
  axios: ['axios'],
  lodash: ['lodash'],
  antd: ['antd', 'ant design'],
  lexical: ['lexical editor', 'facebook/lexical'],
  '@lexical/react': ['lexical-react'],
  zustand: ['zustand'],
  tailwindcss: ['tailwindcss', 'tailwind css'],
  '@radix-ui/react-dialog': ['radix-ui'],
  '@radix-ui/react-popover': ['radix-ui'],
  '@sentry/nextjs': ['sentry-javascript', '@sentry/'],
  firebase: ['firebase-js'],
  tinymce: ['tinymce'],
  zod: ['colinhacks/zod'],
  graphql: ['graphql '],
  typescript: ['typescript '],
  'symfony/symfony': ['symfony'],
  'doctrine/orm': ['doctrine'],
  'twig/twig': ['twig'],
  'guzzlehttp/guzzle': ['guzzlehttp', 'guzzle'],
  'monolog/monolog': ['monolog'],
  'api-platform/core': ['api-platform', 'api platform'],
};

const STATIC_REPOS = ['nodejs/node', 'npm/cli', 'vitejs/vite'];
const STATIC_KEYWORDS = ['node.js', 'vite '];

function escapeRegex(s: string): string {
  return s.replace(/[.+*?^$()[\]{}|\\]/g, '\\$&');
}

function deriveKeyword(pkg: string): string | undefined {
  const bare = pkg.replace(/^@[^/]+\//, '').split('/')[0];
  if (!bare || bare.length < 4) return undefined;
  if (!/^[a-z][\w-]*$/i.test(bare)) return undefined;
  return bare;
}

function deriveRepo(pkg: string): string | undefined {
  if (pkg.includes('/') && !pkg.startsWith('@')) return pkg;
  return undefined;
}

export function buildStackTargets(stack: Stack): StackTargets {
  const npmPackages = Object.keys(stack.frontend);
  const composerPackages = Object.keys(stack.backend);

  const osvQueries: OsvQuery[] = [];
  for (const name of npmPackages) osvQueries.push({ name, ecosystem: 'npm' });
  for (const name of composerPackages) osvQueries.push({ name, ecosystem: 'Packagist' });

  const repoSlugs = new Set<string>(STATIC_REPOS);
  for (const name of [...npmPackages, ...composerPackages]) {
    const repo = REPO_OVERRIDES[name] ?? deriveRepo(name);
    if (repo) repoSlugs.add(repo);
  }

  const keywords = new Set<string>(STATIC_KEYWORDS);
  for (const name of [...npmPackages, ...composerPackages]) {
    const explicit = KEYWORD_OVERRIDES[name];
    if (explicit) {
      for (const k of explicit) keywords.add(k);
      continue;
    }
    const derived = deriveKeyword(name);
    if (derived) keywords.add(derived);
  }

  const cveKeywords = [...keywords];
  const keywordRegex = cveKeywords.length > 0
    ? new RegExp(cveKeywords.map(escapeRegex).join('|'), 'i')
    : /(?!)/;

  return {
    osvQueries,
    repoSlugs: [...repoSlugs],
    cveKeywords,
    keywordRegex,
  };
}
