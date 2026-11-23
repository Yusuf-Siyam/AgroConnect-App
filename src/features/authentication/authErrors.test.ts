import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toAuthErrorCode } from './authErrors';
import { authErrorKey } from './errorMessages';
import { en } from '../../locales/en';
import { bn } from '../../locales/bn';

describe('auth error mapping', () => {
  it('uses one generic code for every wrong-email-or-password variant', () => {
    for (const code of [
      'auth/wrong-password',
      'auth/user-not-found',
      'auth/invalid-credential',
    ]) {
      assert.equal(toAuthErrorCode({ code }), 'invalid-credentials');
    }
    assert.equal(authErrorKey('invalid-credentials'), 'error.invalidCredentials');
  });

  it('maps too many attempts to its own localized message', () => {
    assert.equal(toAuthErrorCode({ code: 'auth/too-many-requests' }), 'too-many-attempts');
    assert.equal(authErrorKey('too-many-attempts'), 'error.tooManyAttempts');
    assert.ok(en['error.tooManyAttempts']);
    assert.ok(bn['error.tooManyAttempts']);
  });

  it('maps network and emulator failures to the network message', () => {
    assert.equal(toAuthErrorCode({ code: 'auth/network-request-failed' }), 'network');
    assert.equal(toAuthErrorCode({ code: 'auth/emulator-config-failed' }), 'network');
    assert.equal(toAuthErrorCode({ code: 'unavailable' }), 'network');
    assert.equal(authErrorKey('network'), 'error.network');
  });

  it('maps Firestore permission errors to a permission message', () => {
    assert.equal(toAuthErrorCode({ code: 'permission-denied' }), 'permission-denied');
    assert.equal(toAuthErrorCode({ code: 'firestore/permission-denied' }), 'permission-denied');
    assert.equal(authErrorKey('permission-denied'), 'error.permissionDenied');
  });

  it('maps weak passwords without inventing a fake success', () => {
    assert.equal(toAuthErrorCode({ code: 'auth/weak-password' }), 'weak-password');
    assert.equal(authErrorKey('weak-password'), 'error.weakPassword');
  });

  it('falls back safely for unknown or malformed errors', () => {
    assert.equal(toAuthErrorCode(null), 'unknown');
    assert.equal(toAuthErrorCode({}), 'unknown');
    assert.equal(toAuthErrorCode({ code: 'auth/unexpected' }), 'unknown');
    assert.equal(authErrorKey(null), 'error.generic');
  });
});
