/** Whether a source is due to run: never-fetched or unparseable timestamps are
 *  always due; otherwise due once `intervalMs` (minus a 60s slack, so a slightly
 *  early cron tick still fires) has elapsed since `lastFetchedAt`. Shared by the
 *  adapter eligibility gate and the enricher cadence gate. */
export function isDue(lastFetchedAt: string | undefined, intervalMs: number, now: number): boolean {
  if (!lastFetchedAt) return true;
  const t = new Date(lastFetchedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now - t >= intervalMs - 60_000;
}
