import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server as NetServer } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';

import type { FirebaseAdminServices } from '../src/config/firebase';
import type { ProductPayload } from '../../src/features/farmer/schemas';

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const firebaseConfig = {
  apiKey: 'emulator-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: '1:000000000000:web:emulator-phase11-batch',
};

type Role = 'farmer' | 'buyer';
type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };
type Batch = {
  id: string; code: string; productId: string; farmerId: string; quantity: number; unit: string;
  producedAt: string; status: string; harvestRecordId?: string; expiresAt?: string;
};

let server: NetServer;
let baseUrl: string;
let adminServices: FirebaseAdminServices;
let farmer: TestUser;
let otherFarmer: TestUser;
let buyer: TestUser;
let product: ProductPayload & { sellerId: string };
let otherProduct: ProductPayload & { sellerId: string };
const clientApps: FirebaseApp[] = [];

async function registerUser(label: string, role: Role): Promise<TestUser> {
  const app = initializeApp(firebaseConfig, `${label}-${randomUUID()}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);
  const email = `${label}-${randomUUID()}@example.com`;
  const credential = await createUserWithEmailAndPassword(auth, email, 'phase11-password-123');
  const uid = credential.user.uid;
  const ts = new Date().toISOString();
  await setDoc(doc(firestore, 'users', uid), { uid, email, displayName: label, district: 'Dhaka', role, createdAt: ts, updatedAt: ts });
  return { app, auth, firestore, uid, token: await credential.user.getIdToken(true) };
}

function fetchAs(path: string, token?: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
}

async function expectPermissionDenied(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: { code?: string }) => error.code === 'permission-denied');
}

async function createProduct(user: TestUser, payload: ProductPayload & { sellerId: string }): Promise<void> {
  const { sellerId, ...body } = payload;
  assert.equal(sellerId, user.uid);
  const response = await fetchAs('/api/products', user.token, { method: 'POST', body: JSON.stringify(body) });
  assert.equal(response.status, 201, await response.clone().text());
}

function batchPayload(overrides: Record<string, unknown> = {}) {
  return { productId: product.id, quantity: 50, unit: 'kg', producedAt: '2026-11-01', status: 'active', ...overrides };
}

async function createBatch(user: TestUser, body: Record<string, unknown> = {}): Promise<Batch> {
  const response = await fetchAs('/api/product-batches', user.token, { method: 'POST', body: JSON.stringify(batchPayload(body)) });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as Batch;
}

before(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
  const { createApp } = await import('../src/app.js');
  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
  adminServices = getFirebaseAdmin();
  server = createApp().listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  farmer = await registerUser('p11-batch-farmer', 'farmer');
  otherFarmer = await registerUser('p11-batch-other', 'farmer');
  buyer = await registerUser('p11-batch-buyer', 'buyer');
  product = { id: randomUUID(), sellerId: farmer.uid, name: { bn: 'চাল', en: 'Rice' }, category: 'rice', description: { bn: 'দেশি', en: 'Local' }, price: 100, unit: 'kg', stock: 50, lowStockThreshold: 5, minOrderQty: 1, harvestDate: '2026-11-01', harvestInfo: { district: 'Dhaka', variety: 'BR-11' }, images: [], status: 'active' };
  otherProduct = { ...product, id: randomUUID(), sellerId: otherFarmer.uid };
  await createProduct(farmer, product);
  await createProduct(otherFarmer, otherProduct);
});

after(async () => {
  for (const app of clientApps.splice(0)) await deleteApp(app);
  if (adminServices) await deleteAdminApp(adminServices.app);
  if (server) await new Promise<void>((resolve, reject) => { server.close((error) => (error ? reject(error) : resolve())); });
});

describe('Phase 11 product batch emulator verification', () => {
  it('creates a batch with server-generated unguessable code and enforces ownership', async () => {
    const batch = await createBatch(farmer);
    assert.equal(batch.farmerId, farmer.uid);
    assert.equal(batch.productId, product.id);
    assert.ok(batch.code.length >= 22);
    assert.match(batch.code, /^[A-Za-z0-9_-]+$/);

    const other = await fetchAs(`/api/product-batches/${batch.id}`, otherFarmer.token);
    assert.equal(other.status, 404);
    const buyerRes = await fetchAs('/api/product-batches', buyer.token);
    assert.equal(buyerRes.status, 403);
  });

  it('generates unique batch codes for each created batch', async () => {
    const first = await createBatch(farmer);
    const second = await createBatch(farmer);
    assert.notEqual(first.code, second.code);
    assert.ok(first.code.length >= 22);
    assert.ok(second.code.length >= 22);
  });

  it('returns only public trace fields and hides farmer contact/internal data', async () => {
    await adminServices.firestore.collection('users').doc(farmer.uid).update({
      phoneNumber: '01700000000',
      email: 'secret@example.com',
      addressLine: 'Secret road',
    });
    const batch = await createBatch(farmer);
    const traceRes = await fetchAs('/api/product-batches/trace', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ code: batch.code }),
    });
    assert.equal(traceRes.status, 200, await traceRes.clone().text());
    const raw = await traceRes.text();
    for (const forbidden of ['01700000000', 'secret@example.com', 'Secret road', 'sellerId', 'farmerId', 'harvestRecordId', 'productId', 'batchId']) {
      assert.equal(raw.includes(forbidden), false, `trace leaked ${forbidden}`);
    }
    const trace = JSON.parse(raw) as Record<string, unknown>;
    assert.deepEqual(Object.keys(trace).sort(), ['code', 'crop', 'district', 'farmerDisplayName', 'producedAt', 'productName', 'quantity', 'reputation', 'status', 'unit']);
    assert.equal(trace.code, batch.code);
    assert.equal(trace.status, 'active');
    assert.deepEqual(trace.reputation, { score: null, isNew: true, reviewCount: 0 });
  });

  it('returns 404 for unknown, inactive, or malformed trace codes', async () => {
    const batch = await createBatch(farmer);
    await fetchAs(`/api/product-batches/${batch.id}`, farmer.token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'inactive' }),
    });

    const inactive = await fetchAs('/api/product-batches/trace', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ code: batch.code }),
    });
    assert.equal(inactive.status, 404);

    const unknown = await fetchAs('/api/product-batches/trace', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ code: 'AAAAAAAAAAAAAAAAAAAAAA' }),
    });
    assert.equal(unknown.status, 404);

    const bad = await fetchAs('/api/product-batches/trace', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ code: 'short' }),
    });
    assert.equal(bad.status, 400);
  });

  it('rate limits trace requests', async () => {
    const batch = await createBatch(farmer);
    let lastStatus = 200;
    for (let i = 0; i < 35; i += 1) {
      const res = await fetchAs('/api/product-batches/trace', buyer.token, {
        method: 'POST',
        body: JSON.stringify({ code: batch.code }),
      });
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }
    assert.equal(lastStatus, 429);
  });

  it('denies direct client writes to product batches and batch codes', async () => {
    const batch = await createBatch(farmer);
    await expectPermissionDenied(setDoc(doc(farmer.firestore, 'productBatches', randomUUID()), {
      id: randomUUID(), code: 'AAAAAAAAAAAAAAAAAAAAAA', productId: product.id, farmerId: farmer.uid,
      quantity: 1, unit: 'kg', producedAt: '2026-11-01', status: 'active',
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await expectPermissionDenied(setDoc(doc(farmer.firestore, 'productBatchCodes', 'AAAAAAAAAAAAAAAAAAAAAA'), {
      batchId: batch.id, farmerId: farmer.uid, createdAt: serverTimestamp(),
    }));
    await expectPermissionDenied(getDoc(doc(farmer.firestore, 'productBatchCodes', batch.code)));
  });
});
