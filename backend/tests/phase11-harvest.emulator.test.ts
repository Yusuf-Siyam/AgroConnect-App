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
  deleteDoc,
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
  appId: '1:000000000000:web:emulator-phase11-harvest',
};

type Role = 'farmer' | 'buyer';
type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };
type HarvestRecord = {
  id: string;
  farmerId: string;
  crop: string;
  productId?: string;
  sowingDate: string;
  expectedHarvestDate: string;
  actualHarvestDate?: string;
  expectedQuantity: number;
  unit: string;
  status: string;
  createdAt: string;
};
type HarvestList = { items: HarvestRecord[]; total: number; limit: number; offset: number };

let server: NetServer;
let baseUrl: string;
let adminServices: FirebaseAdminServices;
let farmer: TestUser;
let otherFarmer: TestUser;
let buyer: TestUser;
let product: ProductPayload & { sellerId: string };
let foreignProduct: ProductPayload & { sellerId: string };
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
  const timestamp = new Date().toISOString();
  await setDoc(doc(firestore, 'users', uid), {
    uid,
    email,
    displayName: label,
    role,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
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

function payload(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    crop: 'Rice',
    sowingDate: '2026-01-10',
    expectedHarvestDate: '2026-04-10',
    expectedQuantity: 120,
    unit: 'kg',
    status: 'planned',
    ...overrides,
  };
}

async function createRecord(user: TestUser, body: Record<string, unknown> = {}): Promise<HarvestRecord> {
  const response = await fetchAs('/api/harvest-records', user.token, {
    method: 'POST',
    body: JSON.stringify(payload(body)),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as HarvestRecord;
}

async function listRecords(user: TestUser, query = ''): Promise<HarvestList> {
  const response = await fetchAs(`/api/harvest-records${query}`, user.token);
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()) as HarvestList;
}

async function getRecord(user: TestUser, recordId: string): Promise<HarvestRecord> {
  const response = await fetchAs(`/api/harvest-records/${recordId}`, user.token);
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()) as HarvestRecord;
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

  farmer = await registerUser('p11-harvest-farmer', 'farmer');
  otherFarmer = await registerUser('p11-harvest-other-farmer', 'farmer');
  buyer = await registerUser('p11-harvest-buyer', 'buyer');
  product = {
    id: randomUUID(),
    sellerId: farmer.uid,
    name: { bn: 'চাল', en: 'Rice' },
    category: 'rice',
    description: { bn: 'দেশি চাল', en: 'Local rice' },
    price: 100,
    unit: 'kg',
    stock: 50,
    lowStockThreshold: 5,
    minOrderQty: 1,
    harvestDate: '2026-04-10',
    harvestInfo: { district: 'Dhaka', variety: 'BR-11' },
    images: [],
    status: 'active',
  };
  const { sellerId: _sellerId, ...productBody } = product;
  const productResponse = await fetchAs('/api/products', farmer.token, {
    method: 'POST',
    body: JSON.stringify(productBody),
  });
  assert.equal(productResponse.status, 201, await productResponse.clone().text());

  foreignProduct = { ...product, id: randomUUID(), sellerId: otherFarmer.uid };
  const { sellerId: _otherSellerId, ...foreignBody } = foreignProduct;
  const foreignResponse = await fetchAs('/api/products', otherFarmer.token, {
    method: 'POST',
    body: JSON.stringify(foreignBody),
  });
  assert.equal(foreignResponse.status, 201, await foreignResponse.clone().text());
});

after(async () => {
  for (const app of clientApps.splice(0)) await deleteApp(app);
  if (adminServices) await deleteAdminApp(adminServices.app);
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

describe('Phase 11 harvest records emulator verification', () => {
  it('creates farmer-owned records and lists them with filters and pagination', async () => {
    const first = await createRecord(farmer, {
      crop: 'Rice',
      productId: product.id,
      plot: 'North field',
      expectedHarvestDate: '2026-04-10',
      notes: 'Irrigation on schedule',
    });
    await createRecord(farmer, {
      crop: 'Tomato',
      expectedHarvestDate: '2026-06-20',
      status: 'growing',
    });

    assert.equal(first.farmerId, farmer.uid);
    assert.equal(first.productId, product.id);
    assert.equal(first.plot, 'North field');
    assert.equal(first.status, 'planned');
    assert.equal(typeof first.createdAt, 'string');

    const all = await listRecords(farmer, '?limit=1&offset=0');
    assert.equal(all.limit, 1);
    assert.equal(all.offset, 0);
    assert.equal(all.items.length, 1);
    assert.ok(all.total >= 2);

    const rice = await listRecords(farmer, '?crop=ric&status=planned&from=2026-04-01&to=2026-04-30');
    assert.equal(rice.items.some((item) => item.id === first.id), true);
    assert.equal(rice.items.every((item) => item.crop.toLowerCase().includes('ric')), true);
    assert.equal(rice.items.every((item) => item.status === 'planned'), true);

    const tomatoes = await listRecords(farmer, '?crop=Tomato');
    assert.equal(tomatoes.items.length, 1);
    assert.equal(tomatoes.items[0].status, 'growing');
  });

  it('reads, patches, changes status and deletes a record', async () => {
    const record = await createRecord(farmer);
    const detail = await getRecord(farmer, record.id);
    assert.equal(detail.id, record.id);

    const patchResponse = await fetchAs(`/api/harvest-records/${record.id}`, farmer.token, {
      method: 'PATCH',
      body: JSON.stringify({ crop: 'Wheat', expectedQuantity: 250, plot: 'South field' }),
    });
    assert.equal(patchResponse.status, 200, await patchResponse.clone().text());
    const patched = (await patchResponse.json()) as HarvestRecord;
    assert.equal(patched.crop, 'Wheat');
    assert.equal(patched.expectedQuantity, 250);

    const statusResponse = await fetchAs(`/api/harvest-records/${record.id}/status`, farmer.token, {
      method: 'POST',
      body: JSON.stringify({ status: 'harvested', actualHarvestDate: '2026-04-15' }),
    });
    assert.equal(statusResponse.status, 200, await statusResponse.clone().text());
    const harvested = (await statusResponse.json()) as HarvestRecord;
    assert.equal(harvested.status, 'harvested');
    assert.equal(harvested.actualHarvestDate, '2026-04-15');

    const deleteResponse = await fetchAs(`/api/harvest-records/${record.id}`, farmer.token, {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.status, 204, await deleteResponse.clone().text());
    const missing = await fetchAs(`/api/harvest-records/${record.id}`, farmer.token);
    assert.equal(missing.status, 404);
  });

  it('clears optional harvest fields through PATCH', async () => {
    const record = await createRecord(farmer, {
      productId: product.id,
      plot: 'North field',
      actualHarvestDate: '2026-04-10',
      notes: 'Keep this note',
    });
    const response = await fetchAs(`/api/harvest-records/${record.id}`, farmer.token, {
      method: 'PATCH',
      body: JSON.stringify({ productId: null, plot: null, actualHarvestDate: null, notes: null }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    const patched = (await response.json()) as HarvestRecord;
    assert.equal('productId' in patched, false);
    assert.equal('plot' in patched, false);
    assert.equal('actualHarvestDate' in patched, false);
    assert.equal('notes' in patched, false);
  });

  it('rejects a status change through PATCH', async () => {
    const record = await createRecord(farmer);
    const response = await fetchAs(`/api/harvest-records/${record.id}`, farmer.token, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'harvested' }),
    });
    assert.equal(response.status, 400);
  });

  it('rejects impossible dates and harvested status without an actual date', async () => {
    const badOrder = await fetchAs('/api/harvest-records', farmer.token, {
      method: 'POST',
      body: JSON.stringify(payload({ sowingDate: '2026-08-01', expectedHarvestDate: '2026-04-10' })),
    });
    assert.equal(badOrder.status, 400);
    assert.equal(
      ((await badOrder.json()) as { error: { code: string } }).error.code,
      'INVALID_HARVEST_DATE',
    );

    const impossible = await fetchAs('/api/harvest-records', farmer.token, {
      method: 'POST',
      body: JSON.stringify(payload({ sowingDate: '2026-02-30' })),
    });
    assert.equal(impossible.status, 400);
    assert.equal(
      ((await impossible.json()) as { error: { code: string } }).error.code,
      'VALIDATION_ERROR',
    );

    const record = await createRecord(farmer);
    const missingDate = await fetchAs(`/api/harvest-records/${record.id}/status`, farmer.token, {
      method: 'POST',
      body: JSON.stringify({ status: 'harvested' }),
    });
    assert.equal(missingDate.status, 400);
    assert.equal(
      ((await missingDate.json()) as { error: { code: string } }).error.code,
      'INVALID_HARVEST_DATE',
    );
  });

  it('rejects a product that belongs to another farmer', async () => {
    const own = await fetchAs('/api/harvest-records', farmer.token, {
      method: 'POST',
      body: JSON.stringify(payload({ productId: product.id })),
    });
    assert.equal(own.status, 201, await own.clone().text());

    const foreign = await fetchAs('/api/harvest-records', farmer.token, {
      method: 'POST',
      body: JSON.stringify(payload({ productId: foreignProduct.id })),
    });
    assert.equal(foreign.status, 404);
    assert.equal(
      ((await foreign.json()) as { error: { code: string } }).error.code,
      'PRODUCT_NOT_FOUND',
    );
  });

  it('keeps records private to their owner', async () => {
    const record = await createRecord(farmer, { crop: 'Private crop' });

    const otherResponse = await fetchAs(`/api/harvest-records/${record.id}`, otherFarmer.token);
    assert.equal(otherResponse.status, 404);
    const patch = await fetchAs(`/api/harvest-records/${record.id}`, otherFarmer.token, {
      method: 'PATCH',
      body: JSON.stringify({ crop: 'Stolen' }),
    });
    assert.equal(patch.status, 404);
    const remove = await fetchAs(`/api/harvest-records/${record.id}`, otherFarmer.token, {
      method: 'DELETE',
    });
    assert.equal(remove.status, 404);

    const own = await listRecords(farmer, '?crop=Private');
    assert.equal(own.items.some((item) => item.id === record.id), true);
    const notVisible = await listRecords(otherFarmer, '?crop=Private');
    assert.equal(notVisible.items.some((item) => item.id === record.id), false);
  });

  it('denies buyer access to the farmer API', async () => {
    const list = await fetchAs('/api/harvest-records', buyer.token);
    assert.equal(list.status, 403);
    const create = await fetchAs('/api/harvest-records', buyer.token, {
      method: 'POST',
      body: JSON.stringify(payload()),
    });
    assert.equal(create.status, 403);
  });

  it('denies direct client writes and cross-farmer reads', async () => {
    const record = await createRecord(farmer);
    const firestore = farmer.firestore;
    const recordId = randomUUID();

    await expectPermissionDenied(
      setDoc(doc(firestore, 'harvestRecords', recordId), {
        ...payload(),
        id: recordId,
        farmerId: farmer.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await expectPermissionDenied(
      setDoc(doc(firestore, 'harvestRecords', record.id), { crop: 'Tampered' }, { merge: true }),
    );
    await expectPermissionDenied(deleteDoc(doc(firestore, 'harvestRecords', record.id)));

    await expectPermissionDenied(getDoc(doc(otherFarmer.firestore, 'harvestRecords', record.id)));
  });
});
