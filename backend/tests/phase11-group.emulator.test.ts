import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server as NetServer } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, setDoc } from 'firebase/firestore';

import type { FirebaseAdminServices } from '../src/config/firebase';

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const firebaseConfig = {
  apiKey: 'emulator-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: '1:000000000000:web:emulator-phase11-group',
};

type Role = 'farmer' | 'buyer' | 'admin';
type TestUser = { uid: string; token: string };

let server: NetServer;
let baseUrl: string;
let admin: FirebaseAdminServices;
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
  return { uid, token: await credential.user.getIdToken(true) };
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

async function createProduct(farmer: TestUser, overrides: Record<string, unknown> = {}) {
  const body = {
    id: randomUUID(),
    name: { bn: 'আলু', en: 'Potato' },
    category: 'vegetables',
    description: { bn: 'তাজা', en: 'Fresh' },
    price: 100,
    unit: 'kg',
    stock: 100,
    lowStockThreshold: 5,
    minOrderQty: 1,
    harvestDate: '2026-11-01',
    harvestInfo: { district: 'Dhaka', variety: 'Local' },
    images: [],
    status: 'active',
    ...overrides,
  };
  const res = await fetchAs('/api/products', farmer.token, { method: 'POST', body: JSON.stringify(body) });
  assert.equal(res.status, 201, await res.clone().text());
  return body;
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
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  for (const app of clientApps.splice(0)) await deleteApp(app);
  if (admin) await deleteAdminApp(admin.app);
  if (server) await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

describe('Phase 11 group purchase emulator verification', () => {
  it('creates a group purchase with config bounds and farmer ownership', async () => {
    const farmer = await registerUser('gp-farmer', 'farmer');
    const product = await createProduct(farmer);
    const res = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 5, deadlineInDays: 3 }),
    });
    assert.equal(res.status, 201, await res.clone().text());
    const group = await res.json() as { status: string; participantCount: number };
    assert.equal(group.status, 'open');
    assert.equal(group.participantCount, 0);

    const bad = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 41, maxParticipants: 5, deadlineInDays: 3 }),
    });
    assert.equal(bad.status, 400);
  });

  it('allows buyer join idempotently and creates deterministic pending group order', async () => {
    const farmer = await registerUser('gp-farmer2', 'farmer');
    const buyer = await registerUser('gp-buyer2', 'buyer');
    const product = await createProduct(farmer, { id: randomUUID(), stock: 50 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 5, deadlineInDays: 3 }),
    });
    const group = await create.json() as { id: string };

    const join1 = await fetchAs(`/api/group-purchases/${group.id}/join`, buyer.token, { method: 'POST', body: '{}' });
    assert.equal(join1.status, 201, await join1.clone().text());
    const j1 = await join1.json() as { orderId: string; participant: { buyerId: string } };
    assert.equal(j1.orderId, `gp_${group.id}_${buyer.uid}`);

    const join2 = await fetchAs(`/api/group-purchases/${group.id}/join`, buyer.token, { method: 'POST', body: '{}' });
    assert.equal(join2.status, 201);
    const j2 = await join2.json() as { orderId: string };
    assert.equal(j2.orderId, j1.orderId);

    const orderRes = await fetchAs(`/api/orders/${j1.orderId}`, buyer.token);
    assert.equal(orderRes.status, 200);
    const order = await orderRes.json() as { status: string; totalAmount: number; items: Array<{ priceSource: string; discountPercent?: number }> };
    assert.equal(order.status, 'pending');
    assert.equal(order.items[0].priceSource, 'group');
    assert.equal(order.items[0].discountPercent, 10);
    assert.equal(order.totalAmount, 900);
  });

  it('finalizes successful group by confirming participant orders through canonical path', async () => {
    const farmer = await registerUser('gp-farmer3', 'farmer');
    const buyer1 = await registerUser('gp-buyer3a', 'buyer');
    const buyer2 = await registerUser('gp-buyer3b', 'buyer');
    const product = await createProduct(farmer, { id: randomUUID(), stock: 50, price: 100 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 2, deadlineInDays: 3 }),
    });
    const group = await create.json() as { id: string };
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer1.token, { method: 'POST', body: '{}' });
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer2.token, { method: 'POST', body: '{}' });

    const final = await fetchAs(`/api/group-purchases/${group.id}`, buyer1.token);
    const g = await final.json() as { status: string };
    assert.equal(g.status, 'successful');

    const o1 = await (await fetchAs(`/api/orders/gp_${group.id}_${buyer1.uid}`, buyer1.token)).json() as { status: string };
    const o2 = await (await fetchAs(`/api/orders/gp_${group.id}_${buyer2.uid}`, buyer2.token)).json() as { status: string };
    assert.equal(o1.status, 'accepted');
    assert.equal(o2.status, 'accepted');
  });

  it('fails expired open group, cancels pending group orders, and notifies participants', async () => {
    const farmer = await registerUser('gp-farmer4', 'farmer');
    const buyer = await registerUser('gp-buyer4', 'buyer');
    const adminUser = await registerUser('gp-admin4', 'buyer');
    await admin.firestore.collection('users').doc(adminUser.uid).set({ role: 'admin' }, { merge: true });
    const product = await createProduct(farmer, { id: randomUUID(), stock: 50 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 5, deadlineInDays: 1 }),
    });
    const group = await create.json() as { id: string };
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer.token, { method: 'POST', body: '{}' });

    await admin.firestore.collection('groupPurchases').doc(group.id).set({ deadline: new Date(Date.now() - 3600_000).toISOString() }, { merge: true });
    const evalRes = await fetchAs('/api/admin/group-purchases/evaluate', adminUser.token, { method: 'POST', body: '{}' });
    assert.equal(evalRes.status, 200, await evalRes.clone().text());

    const g = await (await fetchAs(`/api/group-purchases/${group.id}`, buyer.token)).json() as { status: string };
    assert.equal(g.status, 'failed');
    const order = await (await fetchAs(`/api/orders/gp_${group.id}_${buyer.uid}`, buyer.token)).json() as { status: string };
    assert.equal(order.status, 'cancelled');

    const notifs = await admin.firestore.collection('notifications').where('userId', '==', buyer.uid).where('type', '==', 'group_failed').get();
    assert.ok(notifs.size >= 1);
  });
});
