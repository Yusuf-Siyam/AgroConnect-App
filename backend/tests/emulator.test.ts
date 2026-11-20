import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo, Server } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getIdTokenResult,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

import type { FirebaseAdminServices } from '../src/config/firebase';

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

const firebaseConfig = {
  apiKey: 'emulator-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: '1:000000000000:web:emulator',
};

type Client = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
};

type TestUser = {
  client: Client;
  user: User;
  uid: string;
  email: string;
  password: string;
  token: string;
};

let server: Server;
let baseUrl: string;
let admin: FirebaseAdminServices;
let farmer: TestUser;

const clientApps: FirebaseApp[] = [];

function makeClient(name: string): Client {
  const app = initializeApp(firebaseConfig, name);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });

  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);

  return { app, auth, firestore };
}

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'permission-denied'
  );
}

async function registerFarmer(label: string): Promise<TestUser> {
  const client = makeClient(label);
  const email = uniqueEmail(label);
  const password = 'farmer-password-123';

  const credential = await createUserWithEmailAndPassword(client.auth, email, password);
  await updateProfile(credential.user, { displayName: `${label} farmer` });
  await setDoc(doc(client.firestore, 'users', credential.user.uid), {
    uid: credential.user.uid,
    email,
    displayName: `${label} farmer`,
    role: 'farmer',
    isVerified: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    client,
    user: credential.user,
    uid: credential.user.uid,
    email,
    password,
    token: await credential.user.getIdToken(),
  };
}

async function fetchWithToken(path: string, token?: string): Promise<Response> {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return fetch(`${baseUrl}${path}`, { headers });
}

before(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;

  const { createApp } = await import('../src/app.js');
  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
  admin = getFirebaseAdmin();

  server = createApp().listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  for (const app of clientApps.splice(0)) {
    await deleteApp(app);
  }
  if (admin) {
    await deleteAdminApp(admin.app);
  }
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

describe('Phase 3 Firebase emulator verification', () => {
  it('registers and logs in, then accepts a valid ID token on a protected endpoint', async () => {
    farmer = await registerFarmer('phase3');
    await signOut(farmer.client.auth);

    const login = await signInWithEmailAndPassword(
      farmer.client.auth,
      farmer.email,
      farmer.password,
    );
    farmer.user = login.user;
    farmer.token = await login.user.getIdToken();

    const response = await fetchWithToken('/api/auth/me', farmer.token);
    assert.equal(response.status, 200);

    const profile = (await response.json()) as { uid: string; role: string };
    assert.equal(profile.uid, farmer.uid);
    assert.equal(profile.role, 'farmer');
  });

  it('returns 401 for requests with no token or an invalid token', async () => {
    const missing = await fetchWithToken('/api/auth/me');
    assert.equal(missing.status, 401);
    assert.equal(((await missing.json()) as { error: { code: string } }).error.code, 'UNAUTHORIZED');

    const invalid = await fetchWithToken('/api/auth/me', 'not-a-valid-id-token');
    assert.equal(invalid.status, 401);
    assert.equal(((await invalid.json()) as { error: { code: string } }).error.code, 'UNAUTHORIZED');
  });

  it('returns 403 when a valid token has the wrong role', async () => {
    const response = await fetchWithToken('/api/auth/admin-status', farmer.token);
    assert.equal(response.status, 403);
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, 'FORBIDDEN');
  });

  it('accepts an admin claim granted through the trusted Admin SDK', async () => {
    const adminUser = await registerFarmer('admin');
    await admin.auth.setCustomUserClaims(adminUser.uid, { admin: true, role: 'admin' });
    await admin.auth.revokeRefreshTokens(adminUser.uid);
    await signOut(adminUser.client.auth);

    const login = await signInWithEmailAndPassword(
      adminUser.client.auth,
      adminUser.email,
      adminUser.password,
    );
    const token = await login.user.getIdToken();

    const response = await fetchWithToken('/api/auth/admin-status', token);
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { role: string }).role, 'admin');
  });

  it('prevents public sign-up from creating an admin account', async () => {
    const claims = await getIdTokenResult(farmer.user, true);
    assert.notEqual(claims.claims.admin, true);
    assert.notEqual(claims.claims.role, 'admin');

    let escalationError: unknown;
    try {
      await setDoc(
        doc(farmer.client.firestore, 'users', farmer.uid),
        { role: 'admin', isVerified: true },
        { merge: true },
      );
    } catch (error) {
      escalationError = error;
    }

    assert.ok(escalationError, 'Expected Firestore to reject admin role escalation');
    const errorCode =
      typeof escalationError === 'object' &&
      escalationError !== null &&
      'code' in escalationError
        ? String((escalationError as { code: unknown }).code)
        : String(escalationError);
    assert.equal(
      errorCode,
      'permission-denied',
      `Expected permission-denied, received ${errorCode}: ${String(escalationError)}`,
    );

    const snapshot = await admin.firestore.collection('users').doc(farmer.uid).get();
    assert.equal(snapshot.get('role'), 'farmer');
  });

  it('applies Firestore rules to authenticated and unauthenticated clients', async () => {
    const ownProfile = await getDoc(doc(farmer.client.firestore, 'users', farmer.uid));
    assert.equal(ownProfile.exists(), true);

    const anonymous = makeClient('anonymous');
    await assert.rejects(getDoc(doc(anonymous.firestore, 'users', farmer.uid)), isPermissionDenied);

    const otherUid = 'not-the-signed-in-user';
    await assert.rejects(
      setDoc(doc(farmer.client.firestore, 'users', otherUid), {
        uid: otherUid,
        role: 'farmer',
        isVerified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      isPermissionDenied,
    );
  });
});
