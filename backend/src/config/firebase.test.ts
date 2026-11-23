import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getFirebaseAdmin, isFirebaseAdminConfigured, parseFirebaseAdminConfig } from './firebase';

const validEnv = {
  FIREBASE_PROJECT_ID: 'agroconnect-test',
  FIREBASE_CLIENT_EMAIL: 'admin@agroconnect-test.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: 'line-1\\nline-2',
};

describe('Firebase Admin configuration', () => {
  it('normalizes the private key', () => {
    const config = parseFirebaseAdminConfig(validEnv);

    assert.equal(config.projectId, 'agroconnect-test');
    assert.equal(config.clientEmail, 'admin@agroconnect-test.iam.gserviceaccount.com');
    assert.equal(config.privateKey, 'line-1\nline-2');
  });

  it('lists every missing required variable in one error', () => {
    assert.throws(
      () => parseFirebaseAdminConfig({ FIREBASE_PROJECT_ID: 'agroconnect-test' }),
      /FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY/,
    );
  });

  it('treats empty values from a copied .env.example as missing', () => {
    assert.throws(
      () => parseFirebaseAdminConfig({ ...validEnv, FIREBASE_PRIVATE_KEY: '   ' }),
      /FIREBASE_PRIVATE_KEY/,
    );
  });

  it('fails lazily with a clear error when credentials are absent', () => {
    const keys = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_AUTH_EMULATOR_HOST',
      'FIRESTORE_EMULATOR_HOST',
    ] as const;
    const previous = keys.map((key) => process.env[key]);
    keys.forEach((key) => delete process.env[key]);

    try {
      assert.equal(isFirebaseAdminConfigured(), false);
      assert.throws(() => getFirebaseAdmin(), /Firebase Admin is not configured/);
    } finally {
      keys.forEach((key, index) => {
        const value = previous[index];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      });
    }
  });
});
