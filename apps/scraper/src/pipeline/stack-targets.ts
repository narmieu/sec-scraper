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

  // New frontend libraries (stack survey 2026-06-24).
  sharp: 'lovell/sharp',
  echarts: 'apache/echarts',
  'sanitize-html': 'apostrophecms/sanitize-html',
  'react-router': 'remix-run/react-router',
  exceljs: 'exceljs/exceljs',
  moment: 'moment/moment',
  '@react-oauth/google': 'MomenSherif/react-oauth', // verify

  // Backend (Composer): a PHP vendor/package name rarely equals its GitHub slug,
  // so the auto-derived slug 404s and the repo is silently skipped. Pin real repos.
  // (Omitted where derive is already correct: firebase/php-jwt, google/recaptcha,
  // openai-php/client, php-amqplib/php-amqplib, swiftmailer/swiftmailer, hybridauth.)
  'guzzlehttp/guzzle': 'guzzle/guzzle',
  'league/oauth2-client': 'thephpleague/oauth2-client',
  'league/oauth2-server-bundle': 'thephpleague/oauth2-server-bundle', // verify
  'league/flysystem': 'thephpleague/flysystem',
  'elasticsearch/elasticsearch': 'elastic/elasticsearch-php',
  'overblog/graphql-bundle': 'overblog/GraphQLBundle',
  'sentry/sentry': 'getsentry/sentry-php',
  'sentry/sentry-symfony': 'getsentry/sentry-symfony',
  'google/apiclient': 'googleapis/google-api-php-client',
  'nelmio/api-doc-bundle': 'nelmio/NelmioApiDocBundle',
  'nelmio/cors-bundle': 'nelmio/NelmioCorsBundle',
  'tecnickcom/tcpdf': 'tecnickcom/TCPDF',
  'phpoffice/phpspreadsheet': 'PHPOffice/PhpSpreadsheet',
  'mongodb/mongodb': 'mongodb/mongo-php-library',
  'tgalopin/html-sanitizer-bundle': 'tgalopin/HtmlSanitizerBundle', // verify
  'egulias/email-validator': 'egulias/EmailValidator',
  'codeigniter/framework': 'codeigniter4/CodeIgniter4', // CI4 repo; runtime is legacy CI2
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

  // Frontend additions — keep keywords specific so the CVE feed filter (cve-org)
  // doesn't flood on common English words.
  echarts: ['echarts'],
  'sanitize-html': ['sanitize-html'],
  'react-router': ['react-router'],
  moment: ['moment.js', 'momentjs'],
  '@react-oauth/google': ['react-oauth'],

  // Backend additions — bare deriveKeyword() would emit noisy tokens such as
  // "league"/"google"/"egulias"/"tecnickcom"; pin precise keywords instead.
  'firebase/php-jwt': ['php-jwt'],
  'league/oauth2-client': ['oauth2-client'],
  'league/oauth2-server-bundle': ['oauth2-server'],
  'league/flysystem': ['flysystem'],
  'elasticsearch/elasticsearch': ['elasticsearch'],
  'overblog/graphql-bundle': ['graphqlbundle', 'overblog'],
  'sentry/sentry': ['sentry-php'],
  'sentry/sentry-symfony': ['sentry-symfony'],
  'google/apiclient': ['google-api-php-client'],
  'google/recaptcha': ['recaptcha'],
  'openai-php/client': ['openai-php'],
  'nelmio/api-doc-bundle': ['nelmioapidoc', 'nelmio api doc'],
  'nelmio/cors-bundle': ['nelmiocors', 'nelmio cors'],
  'php-amqplib/php-amqplib': ['php-amqplib', 'amqplib'],
  'swiftmailer/swiftmailer': ['swiftmailer'],
  'tecnickcom/tcpdf': ['tcpdf'],
  'phpoffice/phpspreadsheet': ['phpspreadsheet'],
  'mongodb/mongodb': ['mongo-php', 'mongodb php'],
  'hybridauth/hybridauth': ['hybridauth'],
  'tgalopin/html-sanitizer-bundle': ['html-sanitizer'],
  'egulias/email-validator': ['egulias/emailvalidator', 'email-validator'],
  'codeigniter/framework': ['codeigniter'],
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
