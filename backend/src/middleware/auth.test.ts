import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isRoleAllowed, parseBearerToken } from './auth';

describe('auth middleware helpers', () => {
  it('parses only well-formed bearer tokens', () => {
    assert.equal(parseBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
    assert.equal(parseBearerToken('bearer token123'), 'token123');
    assert.equal(parseBearerToken(undefined), null);
    assert.equal(parseBearerToken('Basic abc'), null);
    assert.equal(parseBearerToken('Bearer'), null);
  });

  it('checks roles from the server-side allowlist', () => {
    assert.equal(isRoleAllowed('farmer', ['farmer', 'admin']), true);
    assert.equal(isRoleAllowed('buyer', ['farmer', 'admin']), false);
    assert.equal(isRoleAllowed('admin', ['admin']), true);
  });
});
