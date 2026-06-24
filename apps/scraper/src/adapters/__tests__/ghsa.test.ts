import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { ghsaAdapter } from '../ghsa.js';

function ghsaItem(overrides: Record<string, unknown> = {}) {
  return {
    ghsa_id: 'GHSA-xxxx-yyyy-zzzz',
    cve_id: 'CVE-2021-41720',
    summary: 'Arbitrary code execution in lodash',
    description: 'desc',
    severity: 'critical',
    vulnerabilities: [
      {
        package: { ecosystem: 'npm', name: 'lodash' },
        vulnerable_version_range: '< 4.17.21',
        first_patched_version: '4.17.21',
      },
    ],
    published_at: '2021-09-01T00:00:00Z',
    updated_at: '2021-09-02T00:00:00Z',
    html_url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz',
    ...overrides,
  };
}

describe('ghsaAdapter.normalize: withdrawn', () => {
  it('marks an advisory withdrawn when withdrawn_at is set', () => {
    const v = ghsaAdapter.normalize(ghsaItem({ withdrawn_at: '2022-01-01T00:00:00Z' }));
    assert.equal(v?.withdrawn, true);
  });

  it('does not mark a normal (published) advisory withdrawn', () => {
    const v = ghsaAdapter.normalize(ghsaItem());
    assert.ok(!v?.withdrawn);
  });
});
