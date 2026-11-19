import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseRole } from './userProfile';

describe('role parsing', () => {
  it('accepts only the four defined application roles', () => {
    for (const role of ['farmer', 'buyer', 'transporter', 'admin'] as const) {
      assert.equal(parseRole(role), role);
    }
  });

  it('rejects unknown, empty and non-string roles', () => {
    assert.equal(parseRole('superadmin'), undefined);
    assert.equal(parseRole(''), undefined);
    assert.equal(parseRole(undefined), undefined);
    assert.equal(parseRole(42), undefined);
  });
});
