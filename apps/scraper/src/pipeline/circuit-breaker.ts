import type { SourceHealth } from '@sec/shared';

const FAIL_THRESHOLD = 3;
const OPEN_DURATION_MS = 24 * 60 * 60 * 1000;

export function defaultHealth(): SourceHealth {
  return {
    consecutiveFailures: 0,
    state: 'closed',
  };
}

export function isAllowed(h: SourceHealth | undefined, now = Date.now()): boolean {
  if (!h) return true;
  if (h.state === 'closed' || h.state === 'half-open') return true;
  if (h.state === 'open') {
    if (h.reopenAt && new Date(h.reopenAt).getTime() <= now) return true;
    return false;
  }
  return true;
}

export function nextStateForAttempt(h: SourceHealth, now = Date.now()): SourceHealth {
  if (h.state === 'open' && h.reopenAt && new Date(h.reopenAt).getTime() <= now) {
    return { ...h, state: 'half-open' };
  }
  return h;
}

export function recordSuccess(h: SourceHealth, now = new Date()): SourceHealth {
  return {
    ...h,
    consecutiveFailures: 0,
    state: 'closed',
    lastSuccess: now.toISOString(),
    lastFetchedAt: now.toISOString(),
    lastError: undefined,
    reopenAt: undefined,
  };
}

export function recordFailure(h: SourceHealth, error: string, now = new Date()): SourceHealth {
  const failures = h.consecutiveFailures + 1;
  const open = failures >= FAIL_THRESHOLD || h.state === 'half-open';
  return {
    ...h,
    consecutiveFailures: failures,
    state: open ? 'open' : h.state,
    lastError: error.slice(0, 500),
    reopenAt: open ? new Date(now.getTime() + OPEN_DURATION_MS).toISOString() : h.reopenAt,
  };
}
