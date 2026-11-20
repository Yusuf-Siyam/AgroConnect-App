import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server as NetServer } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type Auth } from 'firebase/auth';
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
import type { ProductPayload } from '../../src/features/farmer/schemas';

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

const firebaseConfig = {
  apiKey: 'emulator-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: '1:000000000000:web:emulator-phase6b',
};

type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };

let server: NetServer;
let baseUrl: string;
let admin: FirebaseAdminServices;
let farmerOne: TestUser;
let farmerTwo: TestUser;
let buyer: TestUser;
let secondBuyer: TestUser;
let transporter: TestUser;
const clientApps: FirebaseApp[] = [];

async function registerUser(
  label: string,
  role: 'farmer' | 'buyer' | 'transporter',
): Promise<TestUser> {
  const app = initializeApp(firebaseConfig, `${label}-${randomUUID()}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);

  const email = `${label}-${randomUUID()}@example.com`;
  const credential = await createUserWithEmailAndPassword(auth, email, 'phase6-password-123');
  await setDoc(doc(firestore, 'users', credential.user.uid), {
    uid: credential.user.uid,
    email,
    displayName: label,
    role,
    isVerified: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return {
    app,
    auth,
    firestore,
    uid: credential.user.uid,
    token: await credential.user.getIdToken(),
  };
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
    minOrderQty: 2,
    harvestDate: '2026-11-01',
    harvestInfo: { district: 'Dhaka', variety: 'BR-11' },
    images: [],
    status: 'active',
    ...overrides,
  };
}

async function createProduct(
  farmer: TestUser,
  overrides: Partial<ProductPayload> = {},
): Promise<ProductPayload> {
  const payload = productPayload(overrides);
  const response = await fetchAs('/api/products', farmer.token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return payload;
}

async function createDeliveredOrder(buyerUser: TestUser, productId: string, sellerId: string) {
  const id = randomUUID();
  await admin.firestore.collection('orders').doc(id).set({
    id,
    buyerId: buyerUser.uid,
    sellerIds: [sellerId],
    items: [
      {
        productId,
        sellerId,
        name: { en: 'Rice' },
        quantity: 2,
        unitPrice: 100,
        unit: 'kg',
      },
    ],
    status: 'delivered',
    totalAmount: 200,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
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

describe('Phase 06B emulator verification', () => {
  it('enforces buyer roles and Zod validation on every new endpoint', async () => {
    farmerOne = await registerUser('farmer-one-b6b', 'farmer');
    farmerTwo = await registerUser('farmer-two-b6b', 'farmer');
    buyer = await registerUser('buyer-b6b', 'buyer');
    secondBuyer = await registerUser('buyer-two-b6b', 'buyer');
    transporter = await registerUser('transporter-b6b', 'transporter');

    const protectedRoutes = [
      '/api/cart',
      '/api/wishlist',
      '/api/reviews?productId=x',
      '/api/reviews/eligibility/x',
    ];
    for (const path of protectedRoutes) {
      const forbidden = await fetchAs(path, transporter.token);
      assert.equal(forbidden.status, 403, `${path}: ${await forbidden.clone().text()}`);
      assert.equal(await errorCode(forbidden), 'FORBIDDEN');

      const unauthorized = await fetchAs(path);
      assert.equal(unauthorized.status, 401);
      assert.equal(await errorCode(unauthorized), 'UNAUTHORIZED');
    }

    const invalidCartQuantity = await fetchAs('/api/cart/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: randomUUID(), quantity: 0 }),
    });
    assert.equal(invalidCartQuantity.status, 400);
    assert.equal(await errorCode(invalidCartQuantity), 'VALIDATION_ERROR');

    const invalidCartUpdate = await fetchAs(`/api/cart/items/${randomUUID()}`, buyer.token, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: -1 }),
    });
    assert.equal(invalidCartUpdate.status, 400);

    const invalidWishlist = await fetchAs('/api/wishlist/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: '', extra: true }),
    });
    assert.equal(invalidWishlist.status, 400);
    assert.equal(await errorCode(invalidWishlist), 'VALIDATION_ERROR');

    const invalidReview = await fetchAs('/api/reviews', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: randomUUID(), rating: 6 }),
    });
    assert.equal(invalidReview.status, 400);
    assert.equal(await errorCode(invalidReview), 'VALIDATION_ERROR');

    const invalidReviewQuery = await fetchAs('/api/reviews?limit=0', buyer.token);
    assert.equal(invalidReviewQuery.status, 400);

    const invalidWishlistQuery = await fetchAs('/api/wishlist?offset=-1', buyer.token);
    assert.equal(invalidWishlistQuery.status, 400);
  });

  it('manages the cart with live prices, stock rules and multiple farmers', async () => {
    const first = await createProduct(farmerOne, { price: 100, stock: 10, minOrderQty: 2 });
    const second = await createProduct(farmerTwo, { price: 200, stock: 8, minOrderQty: 1 });

    const belowMinimum = await fetchAs('/api/cart/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: first.id, quantity: 1 }),
    });
    assert.equal(belowMinimum.status, 400);
    assert.equal(await errorCode(belowMinimum), 'MIN_ORDER_QTY');

    const tooMany = await fetchAs('/api/cart/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: first.id, quantity: 11 }),
    });
    assert.equal(tooMany.status, 400);
    assert.equal(await errorCode(tooMany), 'INSUFFICIENT_STOCK');

    const addedFirst = await fetchAs('/api/cart/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: first.id, quantity: 2 }),
    });
    assert.equal(addedFirst.status, 201, await addedFirst.clone().text());
    let cart = (await addedFirst.json()) as {
      items: { productId: string; unitPrice: number; lineTotal: number }[];
      farmerCount: number;
    };
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0]?.unitPrice, 100);
    assert.equal(cart.items[0]?.lineTotal, 200);

    const addedSecond = await fetchAs('/api/cart/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: second.id, quantity: 1 }),
    });
    assert.equal(addedSecond.status, 201, await addedSecond.clone().text());
    cart = (await addedSecond.json()) as typeof cart;
    assert.equal(cart.items.length, 2);
    assert.equal(cart.farmerCount, 2);

    await admin.firestore.collection('products').doc(first.id).update({ price: 150 });
    const refreshed = await fetchAs('/api/cart', buyer.token);
    const refreshedBody = (await refreshed.json()) as {
      items: { productId: string; unitPrice: number; lineTotal: number }[];
    };
    const refreshedFirst = refreshedBody.items.find((item) => item.productId === first.id);
    assert.equal(refreshedFirst?.unitPrice, 150);
    assert.equal(refreshedFirst?.lineTotal, 300);

    const merged = await fetchAs('/api/cart/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: first.id, quantity: 1 }),
    });
    const mergedBody = (await merged.json()) as {
      items: { productId: string; quantity: number }[];
    };
    assert.equal(mergedBody.items.find((item) => item.productId === first.id)?.quantity, 3);

    const updated = await fetchAs(`/api/cart/items/${first.id}`, buyer.token, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: 4 }),
    });
    const updatedBody = (await updated.json()) as {
      items: { productId: string; quantity: number }[];
    };
    assert.equal(updatedBody.items.find((item) => item.productId === first.id)?.quantity, 4);

    const inactive = await createProduct(farmerOne, { status: 'draft' });
    const addInactive = await fetchAs('/api/cart/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: inactive.id, quantity: 2 }),
    });
    assert.equal(addInactive.status, 400);
    assert.equal(await errorCode(addInactive), 'PRODUCT_UNAVAILABLE');

    await admin.firestore.collection('products').doc(inactive.id).update({ sellerId: buyer.uid });
    const addOwn = await fetchAs('/api/cart/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: inactive.id, quantity: 2 }),
    });
    assert.equal(addOwn.status, 400);
    assert.equal(await errorCode(addOwn), 'OWN_PRODUCT');

    await admin.firestore.collection('products').doc(first.id).update({ stock: 0 });
    const afterStockOut = await fetchAs('/api/cart', buyer.token);
    const stockOutBody = (await afterStockOut.json()) as {
      items: { productId: string; available: boolean; unavailableReason?: string }[];
    };
    assert.equal(
      stockOutBody.items.find((item) => item.productId === first.id)?.available,
      false,
    );
    assert.equal(
      stockOutBody.items.find((item) => item.productId === first.id)?.unavailableReason,
      'PRODUCT_UNAVAILABLE',
    );

    const removed = await fetchAs(`/api/cart/items/${first.id}`, buyer.token, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    const removedBody = (await removed.json()) as { items: { productId: string }[] };
    assert.equal(removedBody.items.some((item) => item.productId === first.id), false);

    const cleared = await fetchAs('/api/cart', buyer.token, { method: 'DELETE' });
    assert.equal(cleared.status, 200);
    const clearedBody = (await cleared.json()) as { items: unknown[]; total: number };
    assert.equal(clearedBody.total, 0);
    assert.equal(clearedBody.items.length, 0);
  });

  it('prevents duplicate wishlist entries and paginates the list', async () => {
    const first = await createProduct(farmerOne, { name: { bn: 'মুলা', en: 'Radish' } });
    const second = await createProduct(farmerTwo, { name: { bn: 'গাজর', en: 'Carrot' } });

    const addedFirst = await fetchAs('/api/wishlist/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: first.id }),
    });
    assert.equal(addedFirst.status, 201, await addedFirst.clone().text());

    const duplicate = await fetchAs('/api/wishlist/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: first.id }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(await errorCode(duplicate), 'DUPLICATE_WISHLIST');

    const addedSecond = await fetchAs('/api/wishlist/items', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: second.id }),
    });
    assert.equal(addedSecond.status, 201, await addedSecond.clone().text());

    const pageOne = await fetchAs('/api/wishlist?limit=1&offset=0', buyer.token);
    const firstPage = (await pageOne.json()) as { total: number; items: { id: string }[] };
    assert.equal(firstPage.total, 2);
    assert.equal(firstPage.items.length, 1);

    const pageTwo = await fetchAs('/api/wishlist?limit=1&offset=1', buyer.token);
    const secondPage = (await pageTwo.json()) as { total: number; items: { id: string }[] };
    assert.equal(secondPage.total, 2);
    assert.equal(secondPage.items.length, 1);
    assert.notEqual(secondPage.items[0]?.id, firstPage.items[0]?.id);

    const removed = await fetchAs(`/api/wishlist/items/${first.id}`, buyer.token, {
      method: 'DELETE',
    });
    assert.equal(removed.status, 200);
    const removedBody = (await removed.json()) as { total: number };
    assert.equal(removedBody.total, 1);
  });

  it('requires delivered product ownership and updates rating aggregates transactionally', async () => {
    const product = await createProduct(farmerOne, { price: 120, stock: 20 });

    const beforeEligibility = await fetchAs(`/api/reviews/eligibility/${product.id}`, buyer.token);
    assert.equal(beforeEligibility.status, 200);
    const beforeBody = (await beforeEligibility.json()) as { eligible: boolean; hasReviewed: boolean };
    assert.deepEqual(beforeBody, {
      eligible: false,
      hasReviewed: false,
      reason: 'NO_DELIVERED_PRODUCT',
    });

    const rejected = await fetchAs('/api/reviews', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, rating: 5, text: 'Great rice' }),
    });
    assert.equal(rejected.status, 403);
    assert.equal(await errorCode(rejected), 'REVIEW_NOT_ELIGIBLE');

    await createDeliveredOrder(buyer, product.id, farmerOne.uid);
    await createDeliveredOrder(secondBuyer, product.id, farmerOne.uid);

    const eligibility = await fetchAs(`/api/reviews/eligibility/${product.id}`, buyer.token);
    assert.equal((await eligibility.json() as { eligible: boolean }).eligible, true);

    const firstReview = await fetchAs('/api/reviews', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, rating: 5, text: 'Excellent quality' }),
    });
    assert.equal(firstReview.status, 201, await firstReview.clone().text());
    const firstReviewBody = (await firstReview.json()) as { id: string; rating: number };
    assert.equal(firstReviewBody.rating, 5);
    assert.equal(firstReviewBody.id, `${buyer.uid}_${product.id}`);

    const duplicate = await fetchAs('/api/reviews', buyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, rating: 1 }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(await errorCode(duplicate), 'REVIEW_DUPLICATE');

    const secondReview = await fetchAs('/api/reviews', secondBuyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, rating: 4 }),
    });
    assert.equal(secondReview.status, 201, await secondReview.clone().text());

    const pageOne = await fetchAs(`/api/reviews?productId=${product.id}&limit=1&offset=0`, buyer.token);
    const firstPage = (await pageOne.json()) as { total: number; items: { id: string }[] };
    assert.equal(firstPage.total, 2);
    assert.equal(firstPage.items.length, 1);

    const pageTwo = await fetchAs(`/api/reviews?productId=${product.id}&limit=1&offset=1`, buyer.token);
    const secondPage = (await pageTwo.json()) as { total: number; items: { id: string }[] };
    assert.equal(secondPage.total, 2);
    assert.equal(secondPage.items.length, 1);
    assert.notEqual(secondPage.items[0]?.id, firstPage.items[0]?.id);

    const productDoc = await admin.firestore.collection('products').doc(product.id).get();
    assert.deepEqual(productDoc.get('ratingSummary'), { average: 4.5, count: 2 });
    const farmerDoc = await admin.firestore.collection('users').doc(farmerOne.uid).get();
    assert.deepEqual(farmerDoc.get('ratingSummary'), { average: 4.5, count: 2 });

    const secondProduct = await createProduct(farmerOne, { name: { bn: 'গম', en: 'Wheat' } });
    await createDeliveredOrder(secondBuyer, secondProduct.id, farmerOne.uid);
    const thirdReview = await fetchAs('/api/reviews', secondBuyer.token, {
      method: 'POST',
      body: JSON.stringify({ productId: secondProduct.id, rating: 2 }),
    });
    assert.equal(thirdReview.status, 201, await thirdReview.clone().text());

    const secondProductDoc = await admin.firestore.collection('products').doc(secondProduct.id).get();
    assert.deepEqual(secondProductDoc.get('ratingSummary'), { average: 2, count: 1 });
    const updatedFarmerDoc = await admin.firestore.collection('users').doc(farmerOne.uid).get();
    assert.deepEqual(updatedFarmerDoc.get('ratingSummary'), { average: 3.7, count: 3 });

    const afterReview = await fetchAs(`/api/reviews/eligibility/${product.id}`, buyer.token);
    const afterBody = (await afterReview.json()) as { eligible: boolean; hasReviewed: boolean; reason?: string };
    assert.deepEqual(afterBody, {
      eligible: false,
      hasReviewed: true,
      reason: 'ALREADY_REVIEWED',
    });
  });
});
