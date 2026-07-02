import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { retryDelayMs, conditionalSince } from '../fetch.js';

describe('retryDelayMs', () => {
  it('uses exponential base with half-jitter floor (rand=0)', () => {
    assert.equal(retryDelayMs(0, 1000, () => 0), 500);
    assert.equal(retryDelayMs(1, 1000, () => 0), 1500);
  });

  it('caps at the full backoff (rand=1)', () => {
    assert.equal(retryDelayMs(0, 1000, () => 1), 1000);
    assert.equal(retryDelayMs(1, 1000, () => 1), 3000);
  });

  it('grows with attempt: later attempt floor exceeds earlier ceiling', () => {
    const earlierMax = retryDelayMs(0, 1000, () => 1);
    const laterMin = retryDelayMs(1, 1000, () => 0);
    assert.ok(laterMin > earlierMax, `${laterMin} !> ${earlierMax}`);
  });

  it('stays within [floor, ceiling] for random jitter', () => {
    for (let k = 0; k < 200; k++) {
      const d = retryDelayMs(1, 1000);
      assert.ok(d >= 1500 && d <= 3000, `out of range: ${d}`);
    }
  });
});

describe('conditionalSince', () => {
  it('returns undefined when there is no prior fetch', () => {
    assert.equal(conditionalSince(undefined, 0), undefined);
  });

  it('returns an HTTP-date string offset back by the margin', () => {
    const iso = '2026-07-02T12:00:00.000Z';
    const out = conditionalSince(iso, 30 * 60_000);
    assert.equal(out, new Date(Date.parse(iso) - 30 * 60_000).toUTCString());
  });

  it('returns undefined for an unparseable timestamp', () => {
    assert.equal(conditionalSince('nope', 1000), undefined);
  });
});
