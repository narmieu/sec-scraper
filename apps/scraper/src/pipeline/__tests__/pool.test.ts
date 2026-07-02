import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { mapPool } from '../pool.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('mapPool', () => {
  it('preserves input order regardless of completion order', async () => {
    // First items resolve slowest, so completion order is the reverse of input.
    const input = [40, 30, 20, 10, 0];
    const out = await mapPool(input, 2, async (ms, i) => {
      await sleep(ms);
      return `${i}:${ms}`;
    });
    assert.deepEqual(out, ['0:40', '1:30', '2:20', '3:10', '4:0']);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await mapPool(items, 4, async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(5);
      active--;
    });
    assert.ok(peak <= 4, `peak ${peak} exceeded limit 4`);
    assert.equal(peak, 4, `expected to saturate the pool, peak was ${peak}`);
  });

  it('runs all items even when count far exceeds concurrency', async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const out = await mapPool(items, 3, async (n) => n * 2);
    assert.equal(out.length, 50);
    assert.deepEqual(out.slice(0, 4), [0, 2, 4, 6]);
    assert.equal(out[49], 98);
  });

  it('returns [] for empty input without invoking fn', async () => {
    let called = false;
    const out = await mapPool([], 4, async () => {
      called = true;
      return 1;
    });
    assert.deepEqual(out, []);
    assert.equal(called, false);
  });

  it('rejects when a task rejects', async () => {
    await assert.rejects(
      mapPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
      /boom/,
    );
  });

  it('treats concurrency larger than input as run-all', async () => {
    const out = await mapPool([1, 2, 3], 100, async (n) => n + 1);
    assert.deepEqual(out, [2, 3, 4]);
  });
});
