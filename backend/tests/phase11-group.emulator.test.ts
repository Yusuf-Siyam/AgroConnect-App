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

  it('scopes the farmer group list to the creator and paginates', async () => {
    const farmer = await registerUser('gp-list-farmer', 'farmer');
    const otherFarmer = await registerUser('gp-list-other-farmer', 'farmer');
    const firstProduct = await createProduct(farmer, { id: randomUUID() });
    const secondProduct = await createProduct(farmer, { id: randomUUID() });
    const foreignProduct = await createProduct(otherFarmer, { id: randomUUID() });

    const createGroup = async (owner: TestUser, productId: string) => {
      const response = await fetchAs('/api/group-purchases', owner.token, {
        method: 'POST',
        body: JSON.stringify({ productId, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 5, deadlineInDays: 3 }),
      });
      assert.equal(response.status, 201, await response.clone().text());
    };
    await createGroup(farmer, firstProduct.id);
    await createGroup(farmer, secondProduct.id);
    await createGroup(otherFarmer, foreignProduct.id);

    const response = await fetchAs('/api/group-purchases/mine?limit=1&offset=1', farmer.token);
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json() as {
      items: { farmerId: string }[];
      total: number;
      limit: number;
      offset: number;
    };
    assert.equal(body.total, 2);
    assert.equal(body.items.length, 1);
    assert.equal(body.items.every((item) => item.farmerId === farmer.uid), true);
    assert.equal(body.limit, 1);
    assert.equal(body.offset, 1);
  });

  it('paginates the buyer group list', async () => {
    const farmer = await registerUser('gp-page-farmer', 'farmer');
    const buyer = await registerUser('gp-page-buyer', 'buyer');
    const firstProduct = await createProduct(farmer, { id: randomUUID() });
    const secondProduct = await createProduct(farmer, { id: randomUUID() });
    for (const product of [firstProduct, secondProduct]) {
      const response = await fetchAs('/api/group-purchases', farmer.token, {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 5, deadlineInDays: 3 }),
      });
      assert.equal(response.status, 201, await response.clone().text());
    }

    const response = await fetchAs('/api/group-purchases?limit=1&offset=1', buyer.token);
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json() as { items: unknown[]; total: number; limit: number; offset: number };
    assert.equal(body.items.length, 1);
    assert.ok(body.total >= 2);
    assert.equal(body.limit, 1);
    assert.equal(body.offset, 1);
  });

  it('join creates no order and does not change stock', async () => {
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
    const j1 = await join1.json() as { participant: { buyerId: string; quantity: number }; group: { committedQuantity: number } };
    assert.equal(j1.participant.buyerId, buyer.uid);
    assert.equal(j1.participant.quantity, 10);
    assert.equal(j1.group.committedQuantity, 10);

    // joining twice is idempotent
    const join2 = await fetchAs(`/api/group-purchases/${group.id}/join`, buyer.token, { method: 'POST', body: '{}' });
    assert.equal(join2.status, 201, await join2.clone().text());
    const j2 = await join2.json() as { group: { committedQuantity: number } };
    assert.equal(j2.group.committedQuantity, 10);

    const orderRes = await fetchAs(`/api/orders/gp_${group.id}_${buyer.uid}`, buyer.token);
    assert.equal(orderRes.status, 404);

    const prod = await (await fetchAs(`/api/products/${product.id}`, farmer.token)).json() as { stock: number };
    assert.equal(prod.stock, 50);
  });

  it('target reached creates exactly one pending order per participant with the group price', async () => {
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

    const o1 = await (await fetchAs(`/api/orders/gp_${group.id}_${buyer1.uid}`, buyer1.token)).json() as { status: string; source?: string; items: Array<{ unitPrice: number; baseUnitPrice: number; discountPercent?: number; priceSource: string; quantity: number }> };
    const o2 = await (await fetchAs(`/api/orders/gp_${group.id}_${buyer2.uid}`, buyer2.token)).json() as { status: string; items: Array<{ unitPrice: number; priceSource: string }> };
    assert.equal(o1.status, 'pending');
    assert.equal(o2.status, 'pending');
    assert.equal(o1.items[0].priceSource, 'group');
    assert.equal(o1.items[0].discountPercent, 10);
    assert.equal(o1.items[0].unitPrice, 90);
    assert.equal(o1.items[0].baseUnitPrice, 100);
    assert.equal(o1.items[0].quantity, 10);
  });

  it('fails expired open group with no orders and notifies participants', async () => {
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
    const orderRes = await fetchAs(`/api/orders/gp_${group.id}_${buyer.uid}`, buyer.token);
    assert.equal(orderRes.status, 404);

    const notifs = await admin.firestore.collection('notifications').where('userId', '==', buyer.uid).where('type', '==', 'group_failed').get();
    assert.ok(notifs.size >= 1);
  });

  it('notifies every participant and the farmer when a group purchase succeeds', async () => {
    const farmer = await registerUser('gp-farmer5', 'farmer');
    const buyer1 = await registerUser('gp-buyer5a', 'buyer');
    const buyer2 = await registerUser('gp-buyer5b', 'buyer');
    const product = await createProduct(farmer, { id: randomUUID(), stock: 50, price: 100 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 2, deadlineInDays: 3 }),
    });
    const group = await create.json() as { id: string };
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer1.token, { method: 'POST', body: '{}' });
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer2.token, { method: 'POST', body: '{}' });

    const final = await fetchAs(`/api/group-purchases/${group.id}`, buyer1.token);
    assert.equal(final.status, 200);
    const g = await final.json() as { status: string };
    assert.equal(g.status, 'successful');

    for (const uid of [buyer1.uid, buyer2.uid, farmer.uid]) {
      const notifs = await admin.firestore.collection('notifications').where('userId', '==', uid).where('type', '==', 'group_successful').get();
      assert.ok(notifs.size >= 1, `expected group_successful notification for ${uid}`);
    }
  });

  it('rejects join when quantity exceeds available stock', async () => {
    const farmer = await registerUser('gp-stock-farmer', 'farmer');
    const buyer1 = await registerUser('gp-stock-buyer1', 'buyer');
    const buyer2 = await registerUser('gp-stock-buyer2', 'buyer');
    const product = await createProduct(farmer, { id: randomUUID(), stock: 15 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 10, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 2, deadlineInDays: 3 }),
    });
    assert.equal(create.status, 201, await create.clone().text());
    const group = await create.json() as { id: string };
    const join1 = await fetchAs(`/api/group-purchases/${group.id}/join`, buyer1.token, { method: 'POST', body: '{}' });
    assert.equal(join1.status, 201, await join1.clone().text());
    const join2 = await fetchAs(`/api/group-purchases/${group.id}/join`, buyer2.token, { method: 'POST', body: '{}' });
    assert.equal(join2.status, 409);
  });

  it('allows a buyer to leave while deal is open', async () => {
    const farmer = await registerUser('gp-leave-farmer', 'farmer');
    const buyer = await registerUser('gp-leave-buyer', 'buyer');
    const product = await createProduct(farmer, { id: randomUUID(), stock: 50 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 5, deadlineInDays: 3 }),
    });
    const group = await create.json() as { id: string };
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer.token, { method: 'POST', body: '{}' });
    const leave = await fetchAs(`/api/group-purchases/${group.id}/leave`, buyer.token, { method: 'POST', body: '{}' });
    assert.equal(leave.status, 200, await leave.clone().text());
    const g = await leave.json() as { committedQuantity: number; participantCount: number };
    assert.equal(g.committedQuantity, 0);
    assert.equal(g.participantCount, 0);
  });

  it('blocks leave after group success', async () => {
    const farmer = await registerUser('gp-leave2-farmer', 'farmer');
    const buyer1 = await registerUser('gp-leave2-buyer1', 'buyer');
    const buyer2 = await registerUser('gp-leave2-buyer2', 'buyer');
    const product = await createProduct(farmer, { id: randomUUID(), stock: 50 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 2, deadlineInDays: 3 }),
    });
    const group = await create.json() as { id: string };
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer1.token, { method: 'POST', body: '{}' });
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer2.token, { method: 'POST', body: '{}' });
    await fetchAs(`/api/group-purchases/${group.id}`, buyer1.token);
    const leave = await fetchAs(`/api/group-purchases/${group.id}/leave`, buyer1.token, { method: 'POST', body: '{}' });
    assert.equal(leave.status, 409);
  });

  it('evaluation twice creates no duplicate orders', async () => {
    const farmer = await registerUser('gp-dup-farmer', 'farmer');
    const buyer1 = await registerUser('gp-dup-buyer1', 'buyer');
    const buyer2 = await registerUser('gp-dup-buyer2', 'buyer');
    const product = await createProduct(farmer, { id: randomUUID(), stock: 50 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 2, deadlineInDays: 3 }),
    });
    const group = await create.json() as { id: string };
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer1.token, { method: 'POST', body: '{}' });
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer2.token, { method: 'POST', body: '{}' });
    await fetchAs(`/api/group-purchases/${group.id}`, buyer1.token);
    await fetchAs(`/api/group-purchases/${group.id}`, buyer1.token);
    const evalRes = await fetchAs('/api/admin/group-purchases/evaluate', (await (async () => { const a = await registerUser('gp-dup-admin', 'buyer'); await admin.firestore.collection('users').doc(a.uid).set({ role: 'admin' }, { merge: true }); return a; })()).token, { method: 'POST', body: '{}' });
    assert.equal(evalRes.status, 200);
    const orders = await admin.firestore.collection('orders').where('groupId', '==', group.id).get();
    assert.equal(orders.size, 2);
  });

  it('counts two simultaneous joins correctly', async () => {
    const farmer = await registerUser('gp-race-farmer', 'farmer');
    const buyer1 = await registerUser('gp-race-buyer1', 'buyer');
    const buyer2 = await registerUser('gp-race-buyer2', 'buyer');
    const product = await createProduct(farmer, { id: randomUUID(), stock: 50 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 5, deadlineInDays: 3 }),
    });
    const group = await create.json() as { id: string };
    const [r1, r2] = await Promise.all([
      fetchAs(`/api/group-purchases/${group.id}/join`, buyer1.token, { method: 'POST', body: '{}' }),
      fetchAs(`/api/group-purchases/${group.id}/join`, buyer2.token, { method: 'POST', body: '{}' }),
    ]);
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    const g = await (await fetchAs(`/api/group-purchases/${group.id}`, buyer1.token)).json() as { participantCount: number; committedQuantity: number };
    assert.equal(g.participantCount, 2);
    assert.equal(g.committedQuantity, 20);
  });

  it('fails with stock_unavailable and creates no orders when stock is insufficient at success', async () => {
    const farmer = await registerUser('gp-short-farmer', 'farmer');
    const buyer1 = await registerUser('gp-short-buyer1', 'buyer');
    const buyer2 = await registerUser('gp-short-buyer2', 'buyer');
    const adminUser = await registerUser('gp-short-admin', 'buyer');
    await admin.firestore.collection('users').doc(adminUser.uid).set({ role: 'admin' }, { merge: true });
    const product = await createProduct(farmer, { id: randomUUID(), stock: 20 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 2, deadlineInDays: 3 }),
    });
    const group = await create.json() as { id: string };
    // Insert participants directly to reach target without triggering eager finalize on join path, then reduce stock before evaluation.
    const now = new Date().toISOString();
    for (const b of [buyer1, buyer2]) {
      await admin.firestore.collection('groupPurchases').doc(group.id).collection('participants').doc(b.uid).set({
        groupId: group.id, buyerId: b.uid, quantity: 10, joinedAt: now, status: 'joined',
      });
    }
    await admin.firestore.collection('groupPurchases').doc(group.id).set({ participantCount: 2, committedQuantity: 20 }, { merge: true });
    await admin.firestore.collection('products').doc(product.id as string).set({ stock: 5 }, { merge: true });
    const evalRes = await fetchAs('/api/admin/group-purchases/evaluate', adminUser.token, { method: 'POST', body: '{}' });
    assert.equal(evalRes.status, 200, await evalRes.clone().text());
    const g = await (await fetchAs(`/api/group-purchases/${group.id}`, buyer1.token)).json() as { status: string; failureReason?: string };
    assert.equal(g.status, 'failed');
    assert.equal(g.failureReason, 'stock_unavailable');
    const orders = await admin.firestore.collection('orders').where('groupId', '==', group.id).get();
    assert.equal(orders.size, 0);
  });

  it('farmer sees no group orders before success', async () => {
    const farmer = await registerUser('gp-noshow-farmer', 'farmer');
    const buyer = await registerUser('gp-noshow-buyer', 'buyer');
    const product = await createProduct(farmer, { id: randomUUID(), stock: 50 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 5, deadlineInDays: 3 }),
    });
    const group = await create.json() as { id: string };
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer.token, { method: 'POST', body: '{}' });
    const ordersRes = await fetchAs('/api/orders', farmer.token);
    assert.equal(ordersRes.status, 200, await ordersRes.clone().text());
    const body = await ordersRes.json() as { items: Array<{ groupId?: string }> };
    assert.equal(body.items.filter((o) => o.groupId === group.id).length, 0);
  });

  it('group_failed notifies participants', async () => {
    const farmer = await registerUser('gp-failnotif-farmer', 'farmer');
    const buyer = await registerUser('gp-failnotif-buyer', 'buyer');
    const adminUser = await registerUser('gp-failnotif-admin', 'buyer');
    await admin.firestore.collection('users').doc(adminUser.uid).set({ role: 'admin' }, { merge: true });
    const product = await createProduct(farmer, { id: randomUUID(), stock: 50 });
    const create = await fetchAs('/api/group-purchases', farmer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, targetQuantity: 20, quantityPerParticipant: 10, discountPercent: 10, maxParticipants: 5, deadlineInDays: 1 }),
    });
    const group = await create.json() as { id: string };
    await fetchAs(`/api/group-purchases/${group.id}/join`, buyer.token, { method: 'POST', body: '{}' });
    await admin.firestore.collection('groupPurchases').doc(group.id).set({ deadline: new Date(Date.now() - 3600_000).toISOString() }, { merge: true });
    await fetchAs('/api/admin/group-purchases/evaluate', adminUser.token, { method: 'POST', body: '{}' });
    const notifs = await admin.firestore.collection('notifications').where('userId', '==', buyer.uid).where('type', '==', 'group_failed').get();
    assert.ok(notifs.size >= 1);
  });
});
