import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveClientConfig } from './client.js';

describe('resolveClientConfig', () => {
  it('uses TURSO_DATABASE_URL + auth token when both are set', () => {
    const cfg = resolveClientConfig({
      TURSO_DATABASE_URL: 'libsql://db.turso.io',
      TURSO_AUTH_TOKEN: 'tok',
    });
    assert.equal(cfg.url, 'libsql://db.turso.io');
    assert.equal(cfg.authToken, 'tok');
  });

  it('omits authToken when only the URL is set', () => {
    const cfg = resolveClientConfig({ TURSO_DATABASE_URL: 'libsql://db.turso.io' });
    assert.equal(cfg.url, 'libsql://db.turso.io');
    assert.equal(cfg.authToken, undefined);
  });

  it('falls back to a local file: URL when TURSO_DATABASE_URL is unset', () => {
    const cfg = resolveClientConfig({});
    assert.ok(cfg.url.startsWith('file:'), `expected file: url, got ${cfg.url}`);
    assert.ok(cfg.url.endsWith('local.db'), `expected local.db, got ${cfg.url}`);
    assert.equal(cfg.authToken, undefined);
  });
});
