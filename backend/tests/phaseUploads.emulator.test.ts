import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo, Server } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';

import { createApp } from '../src/app.js';
import type { FirebaseAdminServices } from '../src/config/firebase.js';
import { createCloudinaryTestService } from '../src/services/cloudinary.testDouble.js';
import { resetCloudinaryService, setCloudinaryService } from '../src/services/cloudinary.js';

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const STORAGE_BUCKET = 'demo-agroconnect.appspot.com';
const CLOUD_NAME = 'test-cloud';

let server: Server;
let baseUrl: string;
let admin: FirebaseAdminServices;
const clientApps: FirebaseApp[] = [];
const state = { deleted: [], failDelete: false, cloudName: CLOUD_NAME };

async function register(role: 'farmer' | 'buyer', label: string) {
  const app = initializeApp({ apiKey: 'x', authDomain: `${PROJECT_ID}.firebaseapp.com`, projectId: PROJECT_ID, appId: `1:1:web:${label}`, storageBucket: STORAGE_BUCKET }, `${label}-${randomUUID()}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);
  const email = `${label}-${randomUUID()}@example.com`;
  const cred = await createUserWithEmailAndPassword(auth, email, 'password123');
  await setDoc(doc(firestore, 'users', cred.user.uid), { uid: cred.user.uid, email, displayName: label, role, isVerified: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return { uid: cred.user.uid, token: await cred.user.getIdToken() };
}

function fetchAs(path: string, token?: string, init?: RequestInit) {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
}

before(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD_NAME;
  process.env.CLOUDINARY_API_KEY = 'key';
  process.env.CLOUDINARY_API_SECRET = 'secret';
  setCloudinaryService(createCloudinaryTestService(state));

  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
  admin = getFirebaseAdmin();
  server = createApp().listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  resetCloudinaryService();
  for (const app of clientApps.splice(0)) await deleteApp(app);
  if (admin) await deleteAdminApp(admin.app);
  if (server) await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

describe('Cloudinary upload endpoints', () => {
  it('requires auth for sign endpoint', async () => {
    const res = await fetchAs('/api/uploads/sign', undefined, { method: 'POST', body: JSON.stringify({ purpose: 'diagnosis' }) });
    assert.equal(res.status, 401);
  });

  it('rejects buyer from sign endpoint', async () => {
    const buyer = await register('buyer', 'buyer');
    const res = await fetchAs('/api/uploads/sign', buyer.token, { method: 'POST', body: JSON.stringify({ purpose: 'diagnosis' }) });
    assert.equal(res.status, 403);
  });

  it('rejects product sign for product not owned by farmer', async () => {
    const owner = await register('farmer', 'owner');
    const other = await register('farmer', 'other');
    const productId = randomUUID();
    await admin.firestore.collection('products').doc(productId).set({ id: productId, sellerId: owner.uid, name: { bn: 'a', en: 'a' }, category: 'cereal', description: { bn: 'd', en: 'd' }, price: 1, unit: 'kg', stock: 1, lowStockThreshold: 1, minOrderQty: 1, harvestDate: '2026-01-01', harvestInfo: { district: 'Dhaka', variety: 'v' }, images: [], status: 'draft', ratingSummary: { average: 0, count: 0 }, deleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const res = await fetchAs('/api/uploads/sign', other.token, { method: 'POST', body: JSON.stringify({ purpose: 'product', productId }) });
    assert.equal(res.status, 404);
  });

  it('returns signed params with caller uid folder and no secret', async () => {
    const farmer = await register('farmer', 'signer');
    const res = await fetchAs('/api/uploads/sign', farmer.token, { method: 'POST', body: JSON.stringify({ purpose: 'diagnosis' }) });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.cloudName, CLOUD_NAME);
    assert.equal(body.folder, `agroconnect/diagnoses/${farmer.uid}`);
    assert.equal(body.signedParams.folder, `agroconnect/diagnoses/${farmer.uid}`);
    assert.equal(body.deliveryType, 'authenticated');
    assert.equal(body.apiSecret, undefined);
    assert.equal(JSON.stringify(body).includes('secret'), false);
  });

  it('rejects client-chosen folder/public params', async () => {
    const farmer = await register('farmer', 'folder');
    const res = await fetchAs('/api/uploads/sign', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ purpose: 'diagnosis', folder: 'agroconnect/diagnoses/someone-else' }),
    });
    assert.equal(res.status, 400);
  });

  it('returns clear error when cloudinary is not configured', async () => {
    const farmer = await register('farmer', 'noconfig');
    const prev = {
      name: process.env.CLOUDINARY_CLOUD_NAME,
      key: process.env.CLOUDINARY_API_KEY,
      secret: process.env.CLOUDINARY_API_SECRET,
    };
    process.env.CLOUDINARY_CLOUD_NAME = '';
    process.env.CLOUDINARY_API_KEY = '';
    process.env.CLOUDINARY_API_SECRET = '';
    resetCloudinaryService();
    try {
      const res = await fetchAs('/api/uploads/sign', farmer.token, {
        method: 'POST',
        body: JSON.stringify({ purpose: 'diagnosis' }),
      });
      assert.equal(res.status, 503);
      const body = await res.json() as any;
      assert.equal(body.error.code, 'CLOUDINARY_NOT_CONFIGURED');
      assert.match(body.error.message, /not configured/i);
      assert.equal(JSON.stringify(body).includes('secret'), false);
    } finally {
      process.env.CLOUDINARY_CLOUD_NAME = prev.name;
      process.env.CLOUDINARY_API_KEY = prev.key;
      process.env.CLOUDINARY_API_SECRET = prev.secret;
      setCloudinaryService(createCloudinaryTestService(state));
    }
  });

  it('reports upload config without secrets', async () => {
    const farmer = await register('farmer', 'cfg');
    const res = await fetchAs('/api/uploads/config', farmer.token);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.deepEqual(body, { provider: 'cloudinary', enabled: true });
    assert.equal(body.apiSecret, undefined);
  });
});
