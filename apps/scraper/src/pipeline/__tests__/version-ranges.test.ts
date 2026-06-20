import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { evaluateRange, toSemverRange } from '@sec/shared';

describe('toSemverRange', () => {
  it('treats comma as AND, not OR', () => {
    assert.equal(toSemverRange('>=1.0.0, <2.0.0'), '>=1.0.0 <2.0.0');
  });
  it('keeps || as OR', () => {
    assert.equal(toSemverRange('<1.0.0 || >=2.0.0'), '<1.0.0 || >=2.0.0');
  });
  it('maps any/empty/* to *', () => {
    assert.equal(toSemverRange('any'), '*');
    assert.equal(toSemverRange(''), '*');
  });
  it('returns null for unparseable input', () => {
    assert.equal(toSemverRange('garbage~~'), null);
  });
});

describe('evaluateRange: npm pinned installed version', () => {
  it('in-range -> in', () => {
    assert.equal(evaluateRange('npm', '14.2.35', '>=14.0.0 <15.0.0'), 'in');
  });
  it('out-of-range -> out', () => {
    assert.equal(evaluateRange('npm', '14.2.35', '<13.0.0'), 'out');
  });
  it('comma-AND is intersection: 2.5.0 not in >=1.0.0, <2.0.0', () => {
    assert.equal(evaluateRange('npm', '2.5.0', '>=1.0.0, <2.0.0'), 'out');
  });
  it('comma-AND is intersection: 1.5.0 in >=1.0.0, <2.0.0', () => {
    assert.equal(evaluateRange('npm', '1.5.0', '>=1.0.0, <2.0.0'), 'in');
  });
  it('OR range matches the upper clause', () => {
    assert.equal(evaluateRange('npm', '2.5.0', '<1.0.0 || >=2.0.0 <3.0.0'), 'in');
  });
  it('hyphen range', () => {
    assert.equal(evaluateRange('npm', '1.2.5', '1.0.0 - 1.5.0'), 'in');
  });
  it('"any" vulnerable range -> in', () => {
    assert.equal(evaluateRange('npm', '14.2.35', 'any'), 'in');
  });
  it('unparseable vulnerable range -> unknown', () => {
    assert.equal(evaluateRange('npm', '14.2.35', 'garbage~~'), 'unknown');
  });
});

describe('evaluateRange: composer constraint installed (range vs range)', () => {
  it('overlapping constraint -> partial', () => {
    assert.equal(evaluateRange('composer', '^6.4', '>=6.4.0 <6.4.9'), 'partial');
  });
  it('disjoint constraint -> out', () => {
    assert.equal(evaluateRange('composer', '^6.4', '<6.0.0'), 'out');
  });
  it('fully-contained constraint -> in (definitely affected)', () => {
    assert.equal(evaluateRange('composer', '^6.4', '>=6.0.0'), 'in');
  });
});

describe('evaluateRange: unversioned tracking ("*")', () => {
  it('specific vulnerable range -> partial', () => {
    assert.equal(evaluateRange('ai-llm', '*', '<1.0.0'), 'partial');
  });
  it('everything vulnerable -> in', () => {
    assert.equal(evaluateRange('ai-llm', '*', 'any'), 'in');
  });
});

describe('evaluateRange: non-semver ecosystems return unknown', () => {
  it('pypi concrete version -> unknown', () => {
    assert.equal(evaluateRange('pypi', '1.2.3', '<2.0.0'), 'unknown');
  });
  it('generic -> unknown', () => {
    assert.equal(evaluateRange('generic', '1.0.0', '<2.0.0'), 'unknown');
  });
});
