import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

import { env } from './env';

const REQUIRED_KEYS = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
] as const;

export type FirebaseAdminConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  storageBucket: string;
};

export type FirebaseAdminServices = {
  app: App;
  auth: Auth;
  firestore: Firestore;
  storage: Storage;
};

let cached: FirebaseAdminServices | undefined;

/**
 * Validates service-account configuration without initializing the SDK.
 * Pure function so it can be unit-tested without real credentials.
 */
export function parseFirebaseAdminConfig(
  input: Record<string, string | undefined>,
): FirebaseAdminConfig {
  const missing = REQUIRED_KEYS.filter((key) => !input[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Firebase Admin is not configured. Missing: ${missing.join(', ')}. See backend/.env.example.`,
    );
  }

  const projectId = input.FIREBASE_PROJECT_ID?.trim() ?? '';

  return {
    projectId,
    clientEmail: input.FIREBASE_CLIENT_EMAIL?.trim() ?? '',
    // .env files commonly store the PEM with escaped newlines on one line.
    privateKey: (input.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim(),
    storageBucket: input.FIREBASE_STORAGE_BUCKET?.trim() || `${projectId}.appspot.com`,
  };
}

export function isFirebaseAdminConfigured(): boolean {
  return REQUIRED_KEYS.every((key) => Boolean(process.env[key]?.trim()));
}

/** The Admin SDK honors these host variables and bypasses real credentials. */
export function isFirebaseEmulatorEnabled(): boolean {
  return Boolean(
    process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim() || process.env.FIRESTORE_EMULATOR_HOST?.trim(),
  );
}

/**
 * Lazily initializes the Admin SDK. Emulator host variables use a credential-free
 * app. Missing real credentials never prevent the HTTP server from starting
 * (e.g. /api/health); they fail only when a service is used.
 */
export function getFirebaseAdmin(): FirebaseAdminServices {
  if (!cached) {
    let app: App;

    if (isFirebaseEmulatorEnabled()) {
      const projectId =
        process.env.FIREBASE_PROJECT_ID?.trim() || process.env.GCLOUD_PROJECT?.trim() || 'demo-agroconnect';
      app =
        getApps().length > 0
          ? getApp()
          : initializeApp({
              projectId,
              storageBucket: env.firebaseStorageBucket || `${projectId}.appspot.com`,
            });
    } else {
      const config = parseFirebaseAdminConfig({
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
        FIREBASE_STORAGE_BUCKET: env.firebaseStorageBucket,
      });

      app =
        getApps().length > 0
          ? getApp()
          : initializeApp({
              credential: cert({
                projectId: config.projectId,
                clientEmail: config.clientEmail,
                privateKey: config.privateKey,
              }),
              projectId: config.projectId,
              storageBucket: config.storageBucket,
            });
    }

    cached = {
      app,
      auth: getAuth(app),
      firestore: getFirestore(app),
      storage: getStorage(app),
    };
  }

  return cached;
}
