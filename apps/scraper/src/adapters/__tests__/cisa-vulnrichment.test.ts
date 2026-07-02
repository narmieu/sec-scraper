import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { makeCisaVulnrichmentAdapter } from '../cisa-vulnrichment.js';
import type { StackTargets } from '../../pipeline/stack-targets.js';

const targets: StackTargets = {
  osvQueries: [],
  repoSlugs: [],
  cveKeywords: ['lodash'],
  keywordRegex: /lodash/i,
};
const adapter = makeCisaVulnrichmentAdapter(targets);

function item(o: { title?: string; desc?: string; kev?: boolean } = {}) {
  const { title = 'Something generic', desc = 'A generic vulnerability', kev = false } = o;
  return {
    sha: 'abc',
    path: 'cves/2026/CVE-2026-9.json',
    cveId: 'CVE-2026-9',
    record: {
      cveMetadata: { cveId: 'CVE-2026-9', datePublished: '2026-06-10T00:00:00Z' },
      containers: {
        cna: { title, descriptions: [{ lang: 'en', value: desc }] },
        adp: kev ? [{ metrics: [{ other: { type: 'kev' } }] }] : [],
      },
    },
  };
}

describe('makeCisaVulnrichmentAdapter: relevance filter', () => {
  it('keeps a stack-relevant record (keyword in title)', () => {
    assert.ok(adapter.normalize(item({ title: 'RCE in lodash template' })));
  });

  it('drops a non-KEV record that does not match the stack', () => {
    assert.equal(adapter.normalize(item({ title: 'Generic bug', desc: 'nothing relevant here' })), null);
  });

  it('keeps a KEV record even when it does not match the stack', () => {
    assert.ok(adapter.normalize(item({ title: 'Generic bug', desc: 'nothing relevant', kev: true })));
  });
});
