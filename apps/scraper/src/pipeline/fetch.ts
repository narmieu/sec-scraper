import { fetch } from 'undici';

export interface FetchOpts {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  ifModifiedSince?: string;
  method?: 'GET' | 'POST';
  body?: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: string,
  ) {
    super(`HTTP ${status} ${url}`);
  }
}

const DEFAULT_UA = 'security-scraper-bot/0.1 (+https://github.com)';

/** Sentinel returned by {@link fetchTextIfModified} when the server answers 304. */
export const NOT_MODIFIED = Symbol('not-modified');

/** Equal-jitter exponential backoff: half fixed, half random. Jitter avoids a
 *  thundering-herd of retries lining up against a recovering host. `rand` is
 *  injectable for deterministic tests. */
export function retryDelayMs(attempt: number, baseDelayMs: number, rand: () => number = Math.random): number {
  const backoff = baseDelayMs * Math.pow(3, attempt);
  return Math.round(backoff / 2 + rand() * (backoff / 2));
}

/** Builds an `If-Modified-Since` HTTP-date from a prior fetch time, shifted back
 *  by `marginMs` so items published right around the last fetch aren't missed.
 *  Returns undefined when there is no usable prior timestamp. */
export function conditionalSince(lastFetchedAt: string | undefined, marginMs: number): string | undefined {
  if (!lastFetchedAt) return undefined;
  const t = new Date(lastFetchedAt).getTime();
  if (Number.isNaN(t)) return undefined;
  return new Date(t - marginMs).toUTCString();
}

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const r = await fetchWithRetry(url, opts);
  return await r.text();
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const r = await fetchWithRetry(url, opts);
  return (await r.json()) as T;
}

/** Like {@link fetchText} but returns {@link NOT_MODIFIED} on a 304 response
 *  instead of trying to read an empty body. Pair with `opts.ifModifiedSince`. */
export async function fetchTextIfModified(
  url: string,
  opts: FetchOpts = {},
): Promise<string | typeof NOT_MODIFIED> {
  const r = await fetchWithRetry(url, opts);
  if (r.status === 304) return NOT_MODIFIED;
  return await r.text();
}

async function fetchWithRetry(url: string, opts: FetchOpts) {
  const retries = opts.retries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 1000;
  const timeout = opts.timeoutMs ?? 12_000;

  const headers: Record<string, string> = {
    'user-agent': DEFAULT_UA,
    accept: 'application/json, text/xml, application/atom+xml, text/html, */*',
    ...opts.headers,
  };
  if (opts.ifModifiedSince) headers['if-modified-since'] = opts.ifModifiedSince;

  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const init: Parameters<typeof fetch>[1] = {
        headers,
        signal: controller.signal,
        method: opts.method ?? 'GET',
      };
      if (opts.body !== undefined) init.body = opts.body;
      const r = await fetch(url, init);
      clearTimeout(t);
      if (r.ok || r.status === 304) return r;
      if (r.status >= 400 && r.status < 500) {
        const body = await r.text().catch(() => '');
        throw new HttpError(r.status, url, body.slice(0, 200));
      }
      lastErr = new HttpError(r.status, url, '');
    } catch (e: unknown) {
      clearTimeout(t);
      if (e instanceof HttpError && e.status >= 400 && e.status < 500) throw e;
      lastErr = e;
    }
    if (attempt < retries - 1) {
      const delay = retryDelayMs(attempt, baseDelay);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastErr;
}
