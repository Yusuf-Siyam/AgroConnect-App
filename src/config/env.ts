// Expo inlines statically referenced EXPO_PUBLIC_* variables at build time.
// Only non-secret values may be placed in these variables. Dynamic access
// (for example process.env[key]) is NOT inlined, so keep these explicit.
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

// Public Firebase web-app config: safe to ship in the client bundle.
// Firebase Security Rules and backend authorization are the real access control.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

const useEmulator = process.env.EXPO_PUBLIC_USE_EMULATOR === 'true';

export const env = {
  apiBaseUrl,
  isApiConfigured: apiBaseUrl.length > 0,
  useEmulator,
  firebaseConfig,
  isFirebaseConfigured: Object.values(firebaseConfig).every((value) => value.length > 0),
} as const;

export type FirebasePublicConfig = typeof env.firebaseConfig;
