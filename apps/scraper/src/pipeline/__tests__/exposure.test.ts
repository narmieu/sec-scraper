import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { Exposure, Vuln, EXPOSURE_STATUSES, buildStackIndex, evaluateExposure, type Stack, type Affected } from '@sec/shared';

describe('Exposure schema', () => {
  it('exposes the four statuses', () => {
    assert.deepEqual([...EXPOSURE_STATUSES], ['affected', 'safe', 'potential', 'unknown']);
  });

  it('parses a full exposure object', () => {
    const e = Exposure.parse({
      status: 'affected',
      package: 'next',
      ecosystem: 'npm',
      installed: '14.2.35',
      vulnerableRange: '>=14.0.0 <14.2.36',
      fixedIn: '14.2.36',
    });
    assert.equal(e.status, 'affected');
    assert.equal(e.package, 'next');
  });

  it('accepts a vuln WITHOUT an exposure field (optional)', () => {
    const base = {
      id: 'CVE-1', aliases: [], title: 't', summary: '', severity: 'high',
      ecosystems: [], cwe: [], affected: [],
      stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
      priority: 0, kev: false,
      publishedAt: '2020-01-01T00:00:00.000Z', modifiedAt: '2020-01-01T00:00:00.000Z',
      mergedAt: '2020-01-01T00:00:00.000Z',
      sources: [{ source: 's', externalId: 'x', url: 'https://e.com', fetchedAt: '2020-01-01T00:00:00.000Z' }],
      tags: [],
    };
    const parsed = Vuln.parse(base);
    assert.equal(parsed.exposure, undefined);
  });
});

const stack: Stack = {
  frontend: { next: '14.2.35', react: '18.3.1', lodash: '4.17.21' },
  backend: { 'symfony/symfony': '^6.4' },
  tools: { claude: '*' },
};
const idx = buildStackIndex(stack);

function vulnWith(affected: Affected[], title = '', summary = ''): Vuln {
  return {
    id: 'CVE-X', aliases: [], title, summary, severity: 'high',
    ecosystems: [], cwe: [], affected,
    stackMatch: { score: 0, packages: [], reason: 'topic-mention' },
    priority: 0, kev: false,
    publishedAt: '2020-01-01T00:00:00.000Z', modifiedAt: '2020-01-01T00:00:00.000Z',
    mergedAt: '2020-01-01T00:00:00.000Z',
    sources: [{ source: 's', externalId: 'x', url: 'https://e.com', fetchedAt: '2020-01-01T00:00:00.000Z' }],
    tags: [],
  } as Vuln;
}

describe('evaluateExposure', () => {
  it('exact in-range hit -> affected, score 100', () => {
    const { exposure, stackMatch } = evaluateExposure(
      vulnWith([{ ecosystem: 'npm', package: 'next', versions: '>=14.0.0 <14.2.36' }]), idx);
    assert.equal(exposure.status, 'affected');
    assert.equal(exposure.package, 'next');
    assert.equal(exposure.installed, '14.2.35');
    assert.equal(stackMatch.score, 100);
    assert.equal(stackMatch.reason, 'direct-dep');
  });

  it('out-of-range stack package -> safe, score 20', () => {
    const { exposure, stackMatch } = evaluateExposure(
      vulnWith([{ ecosystem: 'npm', package: 'next', versions: '<13.0.0' }]), idx);
    assert.equal(exposure.status, 'safe');
    assert.equal(stackMatch.score, 20);
  });

  it('is order-independent: affected wins over an earlier safe entry', () => {
    const { exposure } = evaluateExposure(
      vulnWith([
        { ecosystem: 'npm', package: 'react', versions: '<17.0.0' },          // safe (react 18.3.1)
        { ecosystem: 'npm', package: 'lodash', versions: '>=4.0.0 <4.18.0' }, // affected (4.17.21)
      ]), idx);
    assert.equal(exposure.status, 'affected');
    assert.equal(exposure.package, 'lodash');
  });

  it('composer constraint overlap -> potential, score 60', () => {
    const { exposure, stackMatch } = evaluateExposure(
      vulnWith([{ ecosystem: 'composer', package: 'symfony/symfony', versions: '>=6.4.0 <6.4.9' }]), idx);
    assert.equal(exposure.status, 'potential');
    assert.equal(stackMatch.score, 60);
  });

  it('composer constraint fully inside vulnerable range -> affected', () => {
    const { exposure, stackMatch } = evaluateExposure(
      vulnWith([{ ecosystem: 'composer', package: 'symfony/symfony', versions: '>=6.0.0' }]), idx);
    assert.equal(exposure.status, 'affected');
    assert.equal(stackMatch.score, 100);
  });

  it('open range but already past fixedIn -> safe', () => {
    const { exposure } = evaluateExposure(
      vulnWith([{ ecosystem: 'npm', package: 'next', versions: '>=0.0.0', fixedIn: '13.0.0' }]), idx);
    assert.equal(exposure.status, 'safe');
  });

  it('no structured match but topic mention -> unknown, score 40', () => {
    const { exposure, stackMatch } = evaluateExposure(vulnWith([], 'lodash prototype pollution'), idx);
    assert.equal(exposure.status, 'unknown');
    assert.equal(stackMatch.score, 40);
    assert.equal(stackMatch.reason, 'topic-mention');
  });

  it('no match at all -> unknown, score 0', () => {
    const { exposure, stackMatch } = evaluateExposure(vulnWith([], 'unrelated kernel bug'), idx);
    assert.equal(exposure.status, 'unknown');
    assert.equal(stackMatch.score, 0);
  });
});
