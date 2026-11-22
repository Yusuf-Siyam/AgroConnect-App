import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AUTH_EMULATOR_RESET_URL } from '../features/authentication/emulatorLinks';
import { bn } from './bn';
import { en } from './en';

describe('locale dictionaries', () => {
  it('has exactly the same keys in Bangla and English', () => {
    assert.deepEqual(Object.keys(bn).sort(), Object.keys(en).sort());
  });

  it('has no empty translations', () => {
    for (const [key, value] of Object.entries(en)) {
      assert.notEqual(value.trim(), '', `English ${key} is empty`);
    }
    for (const [key, value] of Object.entries(bn)) {
      assert.notEqual(value.trim(), '', `Bangla ${key} is empty`);
    }
  });

  it('keeps the neutral reset message identical in meaning across locales', () => {
    assert.match(en['auth.resetSentMessage'], /If this email has an account/);
    assert.match(bn['auth.resetSentMessage'], /অ্যাকাউন্ট/);
    assert.match(en['auth.resetEmulatorNote'], /\{\{url\}\}/);
    assert.equal(
      AUTH_EMULATOR_RESET_URL,
      'http://127.0.0.1:9099/emulator/v1/projects/demo-agroconnect/oobCodes',
    );
  });
});
