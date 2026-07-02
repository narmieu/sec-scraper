/** Runs `fn` over `items` with at most `concurrency` in flight at once,
 *  returning results in input order. Used to parallelize per-item HTTP
 *  fan-out in adapters without hammering a host with an unbounded burst.
 *  Rejects on the first task error (Promise.all semantics); callers that
 *  treat per-item failures as non-fatal should catch inside `fn`. */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
