import type { Client, InStatement } from '@libsql/client';
import type { Vuln } from '@sec/shared';
import { VULN_COLUMNS, vulnToRow, rowToVuln } from './serialize.js';

const UPSERT_SQL = (() => {
  const cols = VULN_COLUMNS;
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(', ');
  return `INSERT INTO vulns (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`;
})();

// Keep batches well under libSQL's per-request statement/size limits.
const BATCH_SIZE = 256;

/** Upserts vulns by id in batched transactions. Existing rows are updated in
 *  place; nothing is deleted (aged-out rows simply fall outside the live window). */
export async function upsertVulns(client: Client, vulns: Vuln[]): Promise<void> {
  for (let i = 0; i < vulns.length; i += BATCH_SIZE) {
    const chunk = vulns.slice(i, i + BATCH_SIZE);
    const stmts: InStatement[] = chunk.map((v) => {
      const row = vulnToRow(v);
      return { sql: UPSERT_SQL, args: VULN_COLUMNS.map((c) => row[c]) };
    });
    await client.batch(stmts, 'write');
  }
}

/** The live working set: non-withdrawn rows modified at/after the cutoff,
 *  highest priority first. Withdrawn (retracted) advisories are excluded. */
export async function loadLiveVulns(client: Client, cutoffIso: string): Promise<Vuln[]> {
  const res = await client.execute({
    sql: 'SELECT * FROM vulns WHERE modified_at >= ? AND withdrawn = 0 ORDER BY priority DESC, published_at DESC',
    args: [cutoffIso],
  });
  return res.rows.map(rowToVuln);
}

export async function getVuln(client: Client, id: string): Promise<Vuln | null> {
  const res = await client.execute({ sql: 'SELECT * FROM vulns WHERE id = ?', args: [id] });
  const row = res.rows[0];
  return row ? rowToVuln(row) : null;
}

/** Deletes vulns by id (used by the prune maintenance tool). No-ops on []. */
export async function deleteVulns(client: Client, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const placeholders = chunk.map(() => '?').join(', ');
    await client.execute({ sql: `DELETE FROM vulns WHERE id IN (${placeholders})`, args: chunk });
  }
}

/** Pure diff: the subset of `next` that is new or whose persisted form differs
 *  from `existing`. Lets callers upsert only what actually changed. */
export function selectChanged(existing: Vuln[], next: Vuln[]): Vuln[] {
  const prev = new Map(existing.map((v) => [v.id, canonical(v)]));
  return next.filter((v) => prev.get(v.id) !== canonical(v));
}

const canonical = (v: Vuln): string => JSON.stringify(vulnToRow(v));
