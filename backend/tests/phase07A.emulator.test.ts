import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server as NetServer } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getFirestore,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

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
  appId: '1:000000000000:web:emulator-phase7a',
};

type Role = 'farmer' | 'buyer' | 'admin';
type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };

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
  const credential = await createUserWithEmailAndPassword(auth, email, 'phase7-password-123');
  const uid = credential.user.uid;
  const timestamp = new Date().toISOString();
  const profile = {
    uid,
    email,
    displayName: label,
    role,
    isVerified: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (role === 'admin') {
    await admin.auth.setCustomUserClaims(uid, { admin: true, role: 'admin' });
    await admin.firestore.collection('users').doc(uid).set(profile);
  } else {
    await setDoc(doc(firestore, 'users', uid), profile);
  }

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

async function json(response: Response): Promise<any> {
  return response.json();
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

function productPayload(overrides: Partial<ProductPayload> = {}): ProductPayload {
  return {
    id: randomUUID(),
    name: { bn: 'চাল', en: 'Rice' },
    category: 'rice',
    description: { bn: 'দেশি চাল', en: 'Local rice' },
    price: 100,
    unit: 'kg',
    stock: 10,
    lowStockThreshold: 2,
    minOrderQty: 1,
    harvestDate: '2026-11-01',
    harvestInfo: { district: 'Dhaka', variety: 'BR-11' },
    images: [],
    status: 'active',
    ...overrides,
  };
}

async function createProduct(farmer: TestUser, overrides: Partial<ProductPayload> = {}): Promise<ProductPayload> {
  const payload = productPayload(overrides);
  const response = await fetchAs('/api/products', farmer.token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return payload;
}

async function addToCart(buyer: TestUser, productId: string, quantity: number): Promise<void> {
  const response = await fetchAs('/api/cart/items', buyer.token, {
    method: 'POST',
    body: JSON.stringify({ productId, quantity }),
  });
  assert.equal(response.status, 201, await response.clone().text());
}

function checkoutBody(checkoutId = randomUUID()) {
  return {
    checkoutId,
    deliveryAddress: {
      addressLine: '12 Farm Road, Mirpur',
      district: 'Dhaka',
      phoneNumber: '+8801712345678',
    },
  };
}

async function checkout(buyer: TestUser, checkoutId = randomUUID()) {
  const response = await fetchAs('/api/orders', buyer.token, {
    method: 'POST',
    body: JSON.stringify(checkoutBody(checkoutId)),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return json(response);
}

async function getProductStock(productId: string): Promise<number> {
  const snapshot = await admin.firestore.collection('products').doc(productId).get();
  return Number(snapshot.get('stock'));
}

async function getStockHistoryCount(productId: string, reason: string): Promise<number> {
  const snapshot = await admin.firestore
    .collection('products')
    .doc(productId)
    .collection('stockHistory')
    .where('reason', '==', reason)
    .get();
  return snapshot.size;
}

function isPermissionDenied(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied');
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
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

describe('Phase 07A emulator verification', () => {
  it('enforces roles, validates requests and exposes no payment transition', async () => {
    const farmer = await registerUser('farmer-role', 'farmer');
    const buyer = await registerUser('buyer-role', 'buyer');

    const farmerCreate = await fetchAs('/api/orders', farmer.token, {
      method: 'POST',
      body: JSON.stringify(checkoutBody()),
    });
    assert.equal(farmerCreate.status, 403);

    const invalidCreate = await fetchAs('/api/orders', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ checkoutId: 'not-a-uuid' }),
    });
    assert.equal(invalidCreate.status, 400);
    assert.equal(await errorCode(invalidCreate), 'VALIDATION_ERROR');

    assert.equal((await fetchAs('/api/orders/mine', farmer.token)).status, 403);
    assert.equal((await fetchAs('/api/orders', buyer.token)).status, 403);
    assert.equal((await fetchAs('/api/orders/none/cancel', farmer.token, { method: 'POST' })).status, 403);

    const patchPaid = await fetchAs('/api/orders/none', buyer.token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paid' }),
    });
    assert.equal(patchPaid.status, 404);
  });

  it('creates one order per farmer from server cart data with snapshots and idempotency', async () => {
    const farmerOne = await registerUser('farmer-checkout-1', 'farmer');
    const farmerTwo = await registerUser('farmer-checkout-2', 'farmer');
    const buyer = await registerUser('buyer-checkout', 'buyer');
    const otherBuyer = await registerUser('buyer-other', 'buyer');

    const productOne = await createProduct(farmerOne, { price: 100, stock: 10, minOrderQty: 1 });
    const productTwo = await createProduct(farmerTwo, { price: 50, stock: 8, minOrderQty: 2 });

    await addToCart(buyer, productOne.id, 2);
    await addToCart(buyer, productTwo.id, 4);

    const checkoutId = randomUUID();
    const result = await checkout(buyer, checkoutId);
    assert.equal(result.farmerCount, 2);
    assert.equal(result.itemCount, 2);
    assert.equal(result.totalAmount, 400);
    assert.equal(result.deliveryFee, null);
    assert.equal(result.orders.length, 2);

    for (const order of result.orders) {
      assert.equal(order.status, 'pending');
      assert.equal(order.deliveryFee, null);
      assert.equal(order.deliveryAddress.district, 'Dhaka');
      assert.equal(order.sellerIds.length, 1);
      assert.equal(order.statusHistory.length, 1);
      assert.equal(order.statusHistory[0].to, 'pending');
    }

    const firstOrder = result.orders.find((order: any) => order.sellerIds[0] === farmerOne.uid);
    const secondOrder = result.orders.find((order: any) => order.sellerIds[0] === farmerTwo.uid);
    assert.ok(firstOrder);
    assert.ok(secondOrder);
    assert.equal(firstOrder.items[0].unitPrice, 100);
    assert.equal(secondOrder.items[0].unitPrice, 50);
    assert.equal(await getProductStock(productOne.id), 10);
    assert.equal(await getProductStock(productTwo.id), 8);

    const cart = await json(await fetchAs('/api/cart', buyer.token));
    assert.equal(cart.items.length, 0);

    const checkoutDocId = createHash('sha256')
      .update(['checkout', buyer.uid, checkoutId].join(':'))
      .digest('hex');
    const checkoutDoc = await admin.firestore.collection('orderCheckouts').doc(checkoutDocId).get();
    assert.equal(checkoutDoc.exists, true);
    assert.deepEqual([...checkoutDoc.get('orderIds')].sort(), [...result.orderIds].sort());

    const repeat = await fetchAs('/api/orders', buyer.token, {
      method: 'POST',
      body: JSON.stringify(checkoutBody(checkoutId)),
    });
    assert.equal(repeat.status, 201);
    const repeated = await json(repeat);
    assert.deepEqual(repeated.orderIds.sort(), [...result.orderIds].sort());

    const mine = await json(await fetchAs('/api/orders/mine', buyer.token));
    assert.equal(mine.total, 2);
    const filtered = await json(await fetchAs('/api/orders/mine?status=pending', buyer.token));
    assert.equal(filtered.total, 2);

    const farmerList = await json(await fetchAs('/api/orders', farmerOne.token));
    assert.equal(farmerList.total, 1);
    assert.equal((await fetchAs(`/api/orders/${firstOrder.id}`, farmerOne.token)).status, 200);
    assert.equal((await fetchAs(`/api/orders/${secondOrder.id}`, otherBuyer.token)).status, 404);
    assert.equal((await fetchAs(`/api/orders/${firstOrder.id}`, farmerTwo.token)).status, 404);
  });

  it('rejects unavailable or below-minimum cart items without creating orders', async () => {
    const farmer = await registerUser('farmer-invalid', 'farmer');
    const buyer = await registerUser('buyer-invalid', 'buyer');
    const product = await createProduct(farmer, { stock: 3, minOrderQty: 1 });

    await addToCart(buyer, product.id, 1);
    await admin.firestore.collection('products').doc(product.id).update({ stock: 0 });

    const unavailable = await fetchAs('/api/orders', buyer.token, {
      method: 'POST',
      body: JSON.stringify(checkoutBody()),
    });
    assert.equal(unavailable.status, 409);
    assert.equal(await errorCode(unavailable), 'PRODUCT_UNAVAILABLE');

    await fetchAs('/api/cart', buyer.token, { method: 'DELETE' });
    const empty = await fetchAs('/api/orders', buyer.token, {
      method: 'POST',
      body: JSON.stringify(checkoutBody()),
    });
    assert.equal(empty.status, 400);
    assert.equal(await errorCode(empty), 'CART_EMPTY');

    const minProduct = await createProduct(farmer, { stock: 10, minOrderQty: 3 });
    await admin.firestore.collection('carts').doc(buyer.uid).set({
      ownerId: buyer.uid,
      items: [
        {
          productId: minProduct.id,
          sellerId: farmer.uid,
          name: { bn: 'চাল', en: 'Rice' },
          unit: 'kg',
          quantity: 1,
          minOrderQty: 3,
          stock: 10,
          price: 100,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const belowMinimum = await fetchAs('/api/orders', buyer.token, {
      method: 'POST',
      body: JSON.stringify(checkoutBody()),
    });
    assert.equal(belowMinimum.status, 400);
    assert.equal(await errorCode(belowMinimum), 'MIN_ORDER_QTY');
  });

  it('reduces stock only on accept and restores it exactly once on cancellation', async () => {
    const farmer = await registerUser('farmer-stock', 'farmer');
    const buyer = await registerUser('buyer-stock', 'buyer');
    const product = await createProduct(farmer, { stock: 10, minOrderQty: 1 });

    await addToCart(buyer, product.id, 3);
    const created = await checkout(buyer);
    const orderId = created.orderIds[0];
    assert.equal(await getProductStock(product.id), 10);

    const acceptedResponse = await fetchAs(`/api/orders/${orderId}/accept`, farmer.token, { method: 'POST' });
    assert.equal(acceptedResponse.status, 200, await acceptedResponse.clone().text());
    const accepted = await json(acceptedResponse);
    assert.equal(accepted.status, 'accepted');
    assert.equal(accepted.stockAdjusted, true);
    assert.equal(await getProductStock(product.id), 7);
    assert.equal(await getStockHistoryCount(product.id, `Order ${orderId} accepted`), 1);

    const secondAccept = await fetchAs(`/api/orders/${orderId}/accept`, farmer.token, { method: 'POST' });
    assert.equal(secondAccept.status, 409);
    assert.equal(await errorCode(secondAccept), 'INVALID_ORDER_TRANSITION');
    assert.equal(await getProductStock(product.id), 7);

    const cancel = await fetchAs(`/api/orders/${orderId}/cancel`, buyer.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Changed plans' }),
    });
    assert.equal(cancel.status, 200, await cancel.clone().text());
    const cancelled = await json(cancel);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.stockRestored, true);
    assert.equal(await getProductStock(product.id), 10);
    assert.equal(await getStockHistoryCount(product.id, `Order ${orderId} cancelled`), 1);
    assert.equal(cancelled.statusHistory.at(-1).to, 'cancelled');

    assert.equal((await fetchAs(`/api/orders/${orderId}/cancel`, buyer.token, { method: 'POST' })).status, 409);
    assert.equal((await fetchAs(`/api/orders/${orderId}/accept`, farmer.token, { method: 'POST' })).status, 409);
    assert.equal(await getProductStock(product.id), 10);

    await addToCart(buyer, product.id, 2);
    const pending = await checkout(buyer);
    const pendingCancel = await fetchAs(`/api/orders/${pending.orderIds[0]}/cancel`, buyer.token, {
      method: 'POST',
    });
    assert.equal(pendingCancel.status, 200, await pendingCancel.clone().text());
    assert.equal(await getProductStock(product.id), 10);
    assert.equal(await getStockHistoryCount(product.id, `Order ${pending.orderIds[0]} cancelled`), 0);
  });

  it('requires a reject reason, allows admin cancellation and blocks direct client writes', async () => {
    const farmer = await registerUser('farmer-rules', 'farmer');
    const buyer = await registerUser('buyer-rules', 'buyer');
    const adminUser = await registerUser('admin-rules', 'admin');
    const product = await createProduct(farmer, { stock: 6, minOrderQty: 1 });

    await addToCart(buyer, product.id, 1);
    const created = await checkout(buyer);
    const rejectOrderId = created.orderIds[0];

    const noReason = await fetchAs(`/api/orders/${rejectOrderId}/reject`, farmer.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'x' }),
    });
    assert.equal(noReason.status, 400);

    const rejected = await fetchAs(`/api/orders/${rejectOrderId}/reject`, farmer.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Out of stock' }),
    });
    assert.equal(rejected.status, 200, await rejected.clone().text());
    assert.equal((await json(rejected)).status, 'rejected');
    assert.equal((await fetchAs(`/api/orders/${rejectOrderId}/accept`, farmer.token, { method: 'POST' })).status, 409);

    await addToCart(buyer, product.id, 2);
    const adminOrder = await checkout(buyer);
    const adminOrderId = adminOrder.orderIds[0];
    assert.equal((await fetchAs(`/api/orders/${adminOrderId}/accept`, farmer.token, { method: 'POST' })).status, 200);
    assert.equal(await getProductStock(product.id), 4);

    const adminCancel = await fetchAs(`/api/orders/${adminOrderId}/cancel`, adminUser.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Administrative cancellation' }),
    });
    assert.equal(adminCancel.status, 200, await adminCancel.clone().text());
    assert.equal((await json(adminCancel)).status, 'cancelled');
    assert.equal(await getProductStock(product.id), 6);
    assert.equal((await fetchAs(`/api/orders/${adminOrderId}/cancel`, adminUser.token, { method: 'POST' })).status, 409);

    await assert.rejects(
      setDoc(doc(buyer.firestore, 'orders', randomUUID()), {
        buyerId: buyer.uid,
        sellerIds: [farmer.uid],
        items: [],
        status: 'paid',
        totalAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      isPermissionDenied,
    );

    await assert.rejects(
      setDoc(doc(buyer.firestore, 'orders', adminOrderId), { status: 'paid' }, { merge: true }),
      isPermissionDenied,
    );

    await assert.rejects(
      setDoc(doc(buyer.firestore, 'orders', adminOrderId, 'statusHistory', randomUUID()), {
        to: 'paid',
      }),
      isPermissionDenied,
    );

    const orderSnapshot = await admin.firestore.collection('orders').doc(adminOrderId).get();
    assert.equal(orderSnapshot.get('status'), 'cancelled');
  });
});
