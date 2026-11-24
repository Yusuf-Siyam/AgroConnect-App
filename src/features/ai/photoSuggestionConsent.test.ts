import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  acceptPhotoSuggestionConsent,
  hasPhotoSuggestionConsent,
  type PhotoConsentStorage,
} from './photoSuggestionConsent';

function memoryStorage(initial: Record<string, string> = {}): PhotoConsentStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe('AI photo suggestion one-time consent', () => {
  it('starts without consent and persists an acknowledgement', async () => {
    const storage = memoryStorage();
    assert.equal(await hasPhotoSuggestionConsent('farmer-1', storage), false);

    assert.equal(await acceptPhotoSuggestionConsent('farmer-1', storage), true);
    assert.equal(await hasPhotoSuggestionConsent('farmer-1', storage), true);
  });

  it('keeps consent separate for each farmer', async () => {
    const storage = memoryStorage();
    await acceptPhotoSuggestionConsent('farmer-1', storage);

    assert.equal(await hasPhotoSuggestionConsent('farmer-1', storage), true);
    assert.equal(await hasPhotoSuggestionConsent('farmer-2', storage), false);
  });

  it('never assumes consent when storage fails', async () => {
    const failingStorage: PhotoConsentStorage = {
      async getItem() {
        throw new Error('storage unavailable');
      },
      async setItem() {
        throw new Error('storage unavailable');
      },
    };

    assert.equal(await hasPhotoSuggestionConsent('farmer-1', failingStorage), false);
    assert.equal(await acceptPhotoSuggestionConsent('farmer-1', failingStorage), false);
  });
});
