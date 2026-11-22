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
  updateDoc,
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
  appId: '1:000000000000:web:emulator-phase6a',
};

type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };

let server: NetServer;
let baseUrl: string;
let admin: FirebaseAdminServices;
let farmer: TestUser;
let buyer: TestUser;
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
  const id = overrides.id ?? randomUUID();
  return {
    id,
    name: { bn: 'চাল', en: 'Rice' },
    category: 'rice',
    description: { bn: 'দেশি চাল', en: 'Local rice' },
    price: 120,
    unit: 'kg',
    stock: 10,
    lowStockThreshold: 3,
    minOrderQty: 1,
    harvestDate: '2026-11-01',
    harvestInfo: { district: 'Dhaka', variety: 'BR-11' },
    images: [],
    status: 'active',
    ...overrides,
  };
}

async function createProduct(overrides: Partial<ProductPayload> = {}): Promise<ProductPayload> {
  const payload = productPayload(overrides);
  const response = await fetchAs('/api/products', farmer.token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return payload;
}

function isPermissionDenied(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return (
    candidate.code === 'permission-denied' ||
    (typeof candidate.message === 'string' && /PERMISSION_DENIED|permission-denied/i.test(candidate.message))
  );
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

describe('Phase 06A emulator verification', () => {
  it('enforces buyer roles and validates every marketplace query', async () => {
    farmer = await registerUser('farmer-b6a', 'farmer');
    buyer = await registerUser('buyer-b6a', 'buyer');
    transporter = await registerUser('transporter-b6a', 'transporter');

    for (const path of [
      '/api/marketplace/products',
      '/api/marketplace/products?limit=1',
      `/api/marketplace/products/${randomUUID()}`,
    ]) {
      const forbidden = await fetchAs(path, transporter.token);
      assert.equal(forbidden.status, 403, `${path}: ${await forbidden.clone().text()}`);
      assert.equal(await errorCode(forbidden), 'FORBIDDEN');
    }

    const noToken = await fetchAs('/api/marketplace/products');
    assert.equal(noToken.status, 401);
    assert.equal(await errorCode(noToken), 'UNAUTHORIZED');

    const badSort = await fetchAs('/api/marketplace/products?sort=unknown', buyer.token);
    assert.equal(badSort.status, 400);
    assert.equal(await errorCode(badSort), 'VALIDATION_ERROR');

    const badLimit = await fetchAs('/api/marketplace/products?limit=0', buyer.token);
    assert.equal(badLimit.status, 400);
    assert.equal(await errorCode(badLimit), 'VALIDATION_ERROR');

    const badRange = await fetchAs('/api/marketplace/products?minPrice=100&maxPrice=10', buyer.token);
    assert.equal(badRange.status, 400);
    assert.equal(await errorCode(badRange), 'VALIDATION_ERROR');

    const unknownField = await fetchAs('/api/marketplace/products?secret=1', buyer.token);
    assert.equal(unknownField.status, 400);
    assert.equal(await errorCode(unknownField), 'VALIDATION_ERROR');

    const categories = await fetchAs('/api/categories');
    assert.equal(categories.status, 200, await categories.clone().text());
    const categoryBody = (await categories.json()) as {
      items: { id: string; name: { bn: string; en: string } }[];
    };
    assert.ok(categoryBody.items.some((item) => item.id === 'rice' && item.name.bn === 'চাল'));
    assert.ok(categoryBody.items.some((item) => item.id === 'vegetable' && item.name.en === 'Vegetable'));
  });

  it('hides drafts/deleted/out-of-stock products and applies filters, search, sort and pagination', async () => {
    // The emulator session is shared by every suite, so isolate this test's
    // products with a unique district token used in every list query.
    const scope = `B6A-${randomUUID()}`;
    const market = (params: Record<string, string | number> = {}) =>
      `/api/marketplace/products?${new URLSearchParams({ district: scope, ...params }).toString()}`;

    const active = await createProduct({
      name: { bn: 'চাল', en: 'Rice' },
      category: 'rice',
      harvestInfo: { district: scope, variety: 'BR-11' },
    });
    const outOfStock = await createProduct({
      name: { bn: 'Tomato', en: 'Tomato' },
      category: 'vegetable',
      stock: 0,
      price: 40,
      harvestInfo: { district: scope, variety: 'Local tomato' },
    });
    const draft = await createProduct({
      name: { bn: 'আপেল', en: 'Apple' },
      category: 'fruit',
      status: 'draft',
      harvestInfo: { district: scope, variety: 'Local apple' },
    });
    const maize = await createProduct({
      name: { bn: 'ভুট্টা', en: 'Maize' },
      category: 'cereal',
      price: 90,
      unit: 'mon',
      harvestInfo: { district: `${scope}-Chittagong`, variety: 'Local maize' },
    });

    const list = await fetchAs(market({ limit: 20, offset: 0 }), buyer.token);
    assert.equal(list.status, 200, await list.clone().text());
    const body = (await list.json()) as { items: { id: string }[]; total: number };
    assert.equal(body.total, 2);
    assert.deepEqual(
      new Set(body.items.map((item) => item.id)),
      new Set([active.id, maize.id]),
    );
    assert.ok(!body.items.some((item) => item.id === outOfStock.id));
    assert.ok(!body.items.some((item) => item.id === draft.id));

    const searchEn = await fetchAs(market({ search: 'rice' }), buyer.token);
    const enResult = (await searchEn.json()) as { total: number; items: { id: string }[] };
    assert.equal(enResult.total, 1);
    assert.equal(enResult.items[0]?.id, active.id);

    const searchBn = await fetchAs(market({ search: 'চাল' }), buyer.token);
    const bnResult = (await searchBn.json()) as { total: number; items: { id: string }[] };
    assert.equal(bnResult.total, 1);
    assert.equal(bnResult.items[0]?.id, active.id);

    const byCategory = await fetchAs(market({ category: 'cereal' }), buyer.token);
    const categoryResult = (await byCategory.json()) as { total: number; items: { id: string }[] };
    assert.equal(categoryResult.total, 1);
    assert.equal(categoryResult.items[0]?.id, maize.id);

    const byUnit = await fetchAs(market({ unit: 'mon' }), buyer.token);
    assert.equal(((await byUnit.json()) as { total: number }).total, 1);

    const byDistrict = await fetchAs(market({ district: `${scope}-Chittagong` }), buyer.token);
    assert.equal(((await byDistrict.json()) as { total: number }).total, 1);

    const byPrice = await fetchAs(market({ minPrice: 100, maxPrice: 150 }), buyer.token);
    assert.equal(((await byPrice.json()) as { total: number }).total, 1);

    // `inStock=false` is accepted, but the marketplace never exposes
    // out_of_stock/draft/deleted products, so the visible set is unchanged.
    const withOutOfStock = await fetchAs(market({ inStock: 'false' }), buyer.token);
    const inStockResult = (await withOutOfStock.json()) as { total: number };
    assert.equal(inStockResult.total, 2);

    const ascending = await fetchAs(market({ sort: 'price_asc' }), buyer.token);
    const ascResult = (await ascending.json()) as { items: { id: string }[] };
    assert.deepEqual(ascResult.items.map((item) => item.id), [maize.id, active.id]);

    const descending = await fetchAs(market({ sort: 'price_desc' }), buyer.token);
    const descResult = (await descending.json()) as { items: { id: string }[] };
    assert.deepEqual(descResult.items.map((item) => item.id), [active.id, maize.id]);

    const secondPage = await fetchAs(market({ limit: 1, offset: 1 }), buyer.token);
    const paged = (await secondPage.json()) as {
      total: number;
      limit: number;
      offset: number;
      items: { id: string }[];
    };
    assert.equal(paged.total, 2);
    assert.equal(paged.limit, 1);
    assert.equal(paged.offset, 1);
    assert.equal(paged.items.length, 1);
    assert.equal(paged.items[0]?.id, active.id);

    const detail = await fetchAs(`/api/marketplace/products/${active.id}`, buyer.token);
    assert.equal(detail.status, 200, await detail.clone().text());
    const detailBody = (await detail.json()) as { ratingSummary: { average: number; count: number } };
    assert.deepEqual(detailBody.ratingSummary, { average: 0, count: 0 });

    const hiddenDraft = await fetchAs(`/api/marketplace/products/${draft.id}`, buyer.token);
    assert.equal(hiddenDraft.status, 404);
    assert.equal(await errorCode(hiddenDraft), 'PRODUCT_NOT_FOUND');

    await admin.firestore.collection('products').doc(active.id).update({ deleted: true });
    const hiddenDeleted = await fetchAs(`/api/marketplace/products/${active.id}`, buyer.token);
    assert.equal(hiddenDeleted.status, 404);

    const afterDelete = await fetchAs(market({}), buyer.token);
    assert.equal(((await afterDelete.json()) as { total: number }).total, 1);
  });

  it('returns only public fields from the farmer profile endpoint', async () => {
    const phone = '+8801712345678';
    const privateAddress = 'Secret village address';
    await admin.firestore.collection('users').doc(farmer.uid).update({
      displayName: 'Farmer Public Name',
      district: 'Dhaka',
      photoURL: 'https://example.com/farmer.jpg',
      phoneNumber: phone,
      address: privateAddress,
      ratingSummary: { average: 4.5, count: 4 },
    });

    const response = await fetchAs(`/api/farmers/${farmer.uid}`);
    assert.equal(response.status, 200, await response.clone().text());
    const raw = await response.text();
    assert.ok(!raw.includes(phone));
    assert.ok(!raw.includes(privateAddress));
    assert.ok(!raw.includes('email'));

    const profile = JSON.parse(raw) as Record<string, unknown>;
    assert.deepEqual(Object.keys(profile).sort(), [
      'displayName',
      'district',
      'id',
      'photoURL',
      'productCount',
      'ratingSummary',
      'reputation',
    ]);
    assert.equal(profile.displayName, 'Farmer Public Name');
    assert.equal(profile.district, 'Dhaka');
    assert.equal(profile.photoURL, 'https://example.com/farmer.jpg');
    assert.deepEqual(profile.ratingSummary, { average: 4.5, count: 4 });
    assert.ok(typeof profile.productCount === 'number');
    assert.ok((profile.productCount as number) >= 1);

    const buyerProfile = await fetchAs(`/api/farmers/${buyer.uid}`);
    assert.equal(buyerProfile.status, 404);
    assert.equal(await errorCode(buyerProfile), 'FARMER_NOT_FOUND');

    const invalid = await fetchAs('/api/farmers/x'.padEnd(500, 'x'));
    assert.equal(invalid.status, 400);
    assert.equal(await errorCode(invalid), 'VALIDATION_ERROR');
  });

  it('enforces Firestore rules for products and buyer-owned state', async () => {
    const draft = await createProduct({ status: 'draft', name: { bn: 'গাজর', en: 'Carrot' } });
    const active = await createProduct({ name: { bn: 'মুলা', en: 'Radish' } });

    await assert.rejects(
      updateDoc(doc(buyer.firestore, 'products', active.id), { price: 1 }),
      isPermissionDenied,
    );

    await assert.rejects(getDoc(doc(buyer.firestore, 'products', draft.id)), isPermissionDenied);

    const readable = await getDoc(doc(buyer.firestore, 'products', active.id));
    assert.equal(readable.exists(), true);

    await setDoc(doc(buyer.firestore, 'carts', buyer.uid), {
      ownerId: buyer.uid,
      items: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await assert.rejects(
      setDoc(doc(buyer.firestore, 'carts', farmer.uid), {
        ownerId: buyer.uid,
        items: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      isPermissionDenied,
    );

    await assert.rejects(
      setDoc(doc(buyer.firestore, 'wishlists', farmer.uid), {
        ownerId: buyer.uid,
        productIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      isPermissionDenied,
    );
  });
});
