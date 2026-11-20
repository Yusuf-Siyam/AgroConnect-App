import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseError, getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';

import { env } from '@/config/env';

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  storage: FirebaseStorage;
};

let services: FirebaseServices | undefined;

const configuredEmulatorHost = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST?.trim();

/**
 * `127.0.0.1` is the host machine for web/iOS Simulator, while `10.0.2.2` is
 * the Android emulator alias for the host loopback interface.
 */
function getEmulatorHost(): string {
  if (configuredEmulatorHost) return configuredEmulatorHost;
  return Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
}

/** True only when all public Firebase values have been supplied in .env. */
export function isFirebaseConfigured(): boolean {
  return env.isFirebaseConfigured;
}

/**
 * Lazily initializes the Firebase JS SDK. Importing this module is safe without
 * credentials; calling getFirebase() without configuration fails with a clear message.
 */
export function getFirebase(): FirebaseServices {
  if (!env.isFirebaseConfigured) {
    throw new Error(
      'Firebase is not configured. Copy .env.example to .env and fill in every EXPO_PUBLIC_FIREBASE_* value.',
    );
  }

  if (!services) {
    const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(env.firebaseConfig);

    let auth: Auth;
    try {
      // Explicit persistence keeps sessions across restarts on every platform.
      auth = initializeAuth(app, {
        persistence:
          Platform.OS === 'web'
            ? browserLocalPersistence
            : getReactNativePersistence(AsyncStorage),
      });
    } catch (error) {
      // Fast Refresh can re-evaluate this module after auth is already initialized.
      if (error instanceof FirebaseError && error.code === 'auth/already-initialized') {
        auth = getAuth(app);
      } else {
        throw error;
      }
    }

    const emulatorHost = getEmulatorHost();
    if (env.useEmulator) {
      connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    }

    const firestore = getFirestore(app);
    if (env.useEmulator) {
      connectFirestoreEmulator(firestore, emulatorHost, 8080);
    }

    const storage = getStorage(app);
    if (env.useEmulator) {
      connectStorageEmulator(storage, emulatorHost, 9199);
    }

    services = {
      app,
      auth,
      firestore,
      storage,
    };
  }

  return services;
}
