import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { isDue } from '../cadence.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = Date.parse('2026-07-02T12:00:00.000Z');

describe('isDue', () => {
  it('is due when never fetched', () => {
    assert.equal(isDue(undefined, DAY, now), true);
  });

  it('is due once the interval (minus 60s slack) has elapsed', () => {
    const last = new Date(now - DAY).toISOString();
    assert.equal(isDue(last, DAY, now), true);
  });

  it('is not due while still inside the interval', () => {
    const last = new Date(now - 2 * HOUR).toISOString();
    assert.equal(isDue(last, DAY, now), false);
  });

  it('allows a 60s slack so hourly cadence fires on a slightly-early tick', () => {
    // 59m30s since last hourly fetch: within the 60s slack window -> due.
    const last = new Date(now - (HOUR - 30_000)).toISOString();
    assert.equal(isDue(last, HOUR, now), true);
  });

  it('treats an unparseable timestamp as due', () => {
    assert.equal(isDue('not-a-date', DAY, now), true);
  });
});
