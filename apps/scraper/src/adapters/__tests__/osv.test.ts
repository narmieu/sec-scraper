import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { makeOsvAdapter } from '../osv.js';
import type { StackTargets } from '../../pipeline/stack-targets.js';

const targets: StackTargets = {
  osvQueries: [],
  repoSlugs: [],
  cveKeywords: [],
  keywordRegex: /^$/,
};
const osv = makeOsvAdapter(targets);

function osvItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'GHSA-aaaa-bbbb-cccc',
    summary: 'Arbitrary code execution in lodash',
    aliases: ['CVE-2021-41720', 'GHSA-aaaa-bbbb-cccc'],
    published: '2021-09-01T00:00:00Z',
    modified: '2021-09-02T00:00:00Z',
    affected: [
      {
        package: { ecosystem: 'npm', name: 'lodash' },
        ranges: [{ type: 'SEMVER', events: [{ fixed: '4.17.21' }] }],
      },
    ],
    ...overrides,
  };
}

describe('makeOsvAdapter.normalize: withdrawn', () => {
  it('marks an advisory withdrawn when the OSV withdrawn timestamp is set', () => {
    const v = osv.normalize(osvItem({ withdrawn: '2022-01-01T00:00:00Z' }));
    assert.equal(v?.withdrawn, true);
  });

  it('does not mark a normal advisory withdrawn', () => {
    const v = osv.normalize(osvItem());
    assert.ok(!v?.withdrawn);
  });
});
