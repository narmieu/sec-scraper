import { createClient as libsqlCreateClient, type Client, type Config } from '@libsql/client';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface ClientConfig {
  url: string;
  authToken?: string;
}

/**
 * Resolves the libSQL connection config. Uses Turso (`TURSO_DATABASE_URL` +
 * optional `TURSO_AUTH_TOKEN`) when configured; otherwise falls back to a local
 * SQLite file at `<repo>/data/local.db` so dev and tests need no network.
 */
export function resolveClientConfig(env: NodeJS.ProcessEnv = process.env): ClientConfig {
  const url = env.TURSO_DATABASE_URL;
  if (url) {
    const authToken = env.TURSO_AUTH_TOKEN;
    return authToken ? { url, authToken } : { url };
  }
  const here = dirname(fileURLToPath(import.meta.url)); // packages/db/src
  const localPath = resolve(here, '..', '..', '..', 'data', 'local.db');
  return { url: pathToFileURL(localPath).href };
}

export function createClient(config: ClientConfig | string): Client {
  const cfg: Config = typeof config === 'string' ? { url: config } : config;
  return libsqlCreateClient(cfg);
}

let cached: Client | null = null;

export function getClient(): Client {
  if (!cached) cached = createClient(resolveClientConfig());
  return cached;
}
