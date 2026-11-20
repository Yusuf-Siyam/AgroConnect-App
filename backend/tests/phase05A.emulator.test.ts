import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo, Server } from 'node:net';
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
import {
  connectStorageEmulator,
  getDownloadURL,
  getStorage,
  ref,
  uploadString,
  type FirebaseStorage,
} from 'firebase/storage';

import type { FirebaseAdminServices } from '../src/config/firebase';
import type { ProductPayload } from '../../src/features/farmer/schemas';

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const STORAGE_HOST = '127.0.0.1';
const STORAGE_PORT = 9199;
const STORAGE_BUCKET = 'demo-agroconnect.appspot.com';

const firebaseConfig = {
  apiKey: 'emulator-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: '1:000000000000:web:emulator',
  storageBucket: STORAGE_BUCKET,
};

type Client = { app: FirebaseApp; auth: Auth; firestore: Firestore; storage: FirebaseStorage };
type TestUser = { client: Client; uid: string; email: string; token: string };

let server: Server;
let baseUrl: string;
let admin: FirebaseAdminServices;
let ownsProductImageUrl: typeof import('../src/services/product').ownsProductImageUrl;
let farmer: TestUser;
let otherFarmer: TestUser;
let buyer: TestUser;
const clientApps: FirebaseApp[] = [];

function makeClient(name: string): Client {
  const app = initializeApp(firebaseConfig, name);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);
  const storage = getStorage(app, `gs://${STORAGE_BUCKET}`);
  connectStorageEmulator(storage, STORAGE_HOST, STORAGE_PORT);
  return { app, auth, firestore, storage };
}

async function registerUser(label: string, role: 'farmer' | 'buyer'): Promise<TestUser> {
  const client = makeClient(`${label}-${randomUUID()}`);
  const email = `${label}-${randomUUID()}@example.com`;
  const credential = await createUserWithEmailAndPassword(client.auth, email, 'phase5-password-123');
  await setDoc(doc(client.firestore, 'users', credential.user.uid), {
    uid: credential.user.uid,
    email,
    displayName: label,
    role,
    isVerified: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return {
    client,
    uid: credential.user.uid,
    email,
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

function productPayload(overrides: Partial<ProductPayload> = {}): ProductPayload {
  const id = overrides.id ?? randomUUID();
  const images = overrides.images ?? [ownedImageUrl(farmer.uid, id)];
  return {
    id,
    name: { bn: 'চাল', en: 'Rice' },
    category: 'cereal',
    description: { bn: 'দেশি চাল', en: 'Local rice' },
    price: 120,
    unit: 'kg',
    stock: 20,
    lowStockThreshold: 5,
    minOrderQty: 1,
    harvestDate: '2026-11-01',
    harvestInfo: { district: 'Dhaka', variety: 'BR-11' },
    images,
    status: 'active',
    ...overrides,
  };
}

function ownedImageUrl(uid: string, productId: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/products%2F${uid}%2F${productId}%2Fphoto.jpg?alt=media`;
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === code
  );
}

function isPermissionDenied(error: unknown): boolean {
  return hasCode(error, 'permission-denied') || hasCode(error, 'storage/unauthorized');
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

before(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_STORAGE_BUCKET = STORAGE_BUCKET;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = `${STORAGE_HOST}:${STORAGE_PORT}`;

  const { createApp } = await import('../src/app.js');
  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
  const productService = await import('../src/services/product.js');
  ownsProductImageUrl = productService.ownsProductImageUrl;
  admin = getFirebaseAdmin();

  server = createApp().listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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

describe('Phase 05A product emulator verification', () => {
  it('rejects buyer access and validates product input with Zod', async () => {
    farmer = await registerUser('farmer-a', 'farmer');
    buyer = await registerUser('buyer-a', 'buyer');

    const forbidden = await fetchAs('/api/products', buyer.token);
    assert.equal(forbidden.status, 403);
    assert.equal(await errorCode(forbidden), 'FORBIDDEN');

    const badPrice = await fetchAs('/api/products', farmer.token, {
      method: 'POST',
      body: JSON.stringify(productPayload({ price: 0, images: [ownedImageUrl(farmer.uid, randomUUID())] })),
    });
    assert.equal(badPrice.status, 400);
    assert.equal(await errorCode(badPrice), 'VALIDATION_ERROR');

    const badStock = await fetchAs('/api/products', farmer.token, {
      method: 'POST',
      body: JSON.stringify(productPayload({ stock: -1, images: [ownedImageUrl(farmer.uid, randomUUID())] })),
    });
    assert.equal(badStock.status, 400);
    assert.equal(await errorCode(badStock), 'VALIDATION_ERROR');
  });

  it('creates products, enforces ownership and verifies Storage image URLs', async () => {
    otherFarmer = await registerUser('farmer-b', 'farmer');
    const payload = productPayload();

    const created = await fetchAs('/api/products', farmer.token, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    assert.equal(created.status, 201, `${JSON.stringify(payload)} => ${await created.clone().text()}`);
    const product = (await created.json()) as { id: string; sellerId: string; status: string };
    assert.equal(product.id, payload.id);
    assert.equal(product.sellerId, farmer.uid);
    assert.equal(product.status, 'active');

    const foreignImage = await fetchAs('/api/products', farmer.token, {
      method: 'POST',
      body: JSON.stringify(
        productPayload({
          id: randomUUID(),
          images: [ownedImageUrl(otherFarmer.uid, randomUUID())],
        }),
      ),
    });
    assert.equal(foreignImage.status, 400);
    assert.equal(await errorCode(foreignImage), 'INVALID_IMAGE_URL');

    const foreignEdit = await fetchAs(`/api/products/${product.id}`, otherFarmer.token, {
      method: 'PATCH',
      body: JSON.stringify({ price: 999 }),
    });
    assert.equal(foreignEdit.status, 404);
    assert.equal(await errorCode(foreignEdit), 'PRODUCT_NOT_FOUND');

    const foreignDelete = await fetchAs(`/api/products/${product.id}`, otherFarmer.token, {
      method: 'DELETE',
    });
    assert.equal(foreignDelete.status, 404);
  });

  it('lists own products with search, status filter and soft delete', async () => {
    const draftId = randomUUID();
    const draft = await fetchAs('/api/products', farmer.token, {
      method: 'POST',
      body: JSON.stringify(
        productPayload({
          id: draftId,
          name: { bn: 'গম', en: 'Wheat' },
          status: 'draft',
          images: [],
        }),
      ),
    });
    assert.equal(draft.status, 201);

    const search = await fetchAs('/api/products?search=wheat&status=draft&limit=5&offset=0', farmer.token);
    assert.equal(search.status, 200);
    const result = (await search.json()) as { items: { id: string }[]; total: number };
    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.id, draftId);

    const stats = await fetchAs('/api/products/stats', farmer.token);
    assert.equal(stats.status, 200);
    const counts = (await stats.json()) as { total: number; draft: number; active: number };
    assert.ok(counts.total >= 2);
    assert.ok(counts.draft >= 1);
    assert.ok(counts.active >= 1);

    const removed = await fetchAs(`/api/products/${draftId}`, farmer.token, { method: 'DELETE' });
    assert.equal(removed.status, 204);
    const afterDelete = await fetchAs(`/api/products/${draftId}`, farmer.token);
    assert.equal(afterDelete.status, 404);
  });

  it('applies Firestore product rules: signed-in active reads, backend-only writes', async () => {
    const activeId = randomUUID();
    const created = await fetchAs('/api/products', farmer.token, {
      method: 'POST',
      body: JSON.stringify(
        productPayload({ id: activeId, images: [ownedImageUrl(farmer.uid, activeId)] }),
      ),
    });
    assert.equal(created.status, 201);

    const activeRead = await getDoc(doc(buyer.client.firestore, 'products', activeId));
    assert.equal(activeRead.exists(), true);

    const draftId = randomUUID();
    const draft = await fetchAs('/api/products', farmer.token, {
      method: 'POST',
      body: JSON.stringify(productPayload({ id: draftId, status: 'draft', images: [] })),
    });
    assert.equal(draft.status, 201);
    await assert.rejects(getDoc(doc(buyer.client.firestore, 'products', draftId)), isPermissionDenied);
    assert.equal((await getDoc(doc(farmer.client.firestore, 'products', draftId))).exists(), true);

    await assert.rejects(
      setDoc(doc(farmer.client.firestore, 'products', randomUUID()), { status: 'active' }),
      isPermissionDenied,
    );
    await assert.rejects(
      setDoc(doc(farmer.client.firestore, 'products', activeId), { price: 1 }, { merge: true }),
      isPermissionDenied,
    );

    const anonymous = makeClient(`anonymous-${randomUUID()}`);
    await assert.rejects(getDoc(doc(anonymous.firestore, 'products', activeId)), isPermissionDenied);
  });

  it('applies Storage rules and accepts real owner upload URLs', async () => {
    const productId = randomUUID();
    const ownerPath = `products/${farmer.uid}/${productId}/photo.jpg`;
    await uploadString(ref(farmer.client.storage, ownerPath), 'fake-jpeg-bytes', 'raw', {
      contentType: 'image/jpeg',
    });

    const url = await getDownloadURL(ref(farmer.client.storage, ownerPath));
    assert.equal(ownsProductImageUrl(url, farmer.uid, productId), true, url);
    assert.equal(ownsProductImageUrl(url, otherFarmer.uid, productId), false);

    const foreignPath = `products/${farmer.uid}/${productId}/foreign.jpg`;
    await assert.rejects(
      uploadString(ref(otherFarmer.client.storage, foreignPath), 'fake-jpeg-bytes', 'raw', {
        contentType: 'image/jpeg',
      }),
      isPermissionDenied,
    );

    const wrongTypePath = `products/${farmer.uid}/${productId}/notes.txt`;
    await assert.rejects(
      uploadString(ref(farmer.client.storage, wrongTypePath), 'text', 'raw', { contentType: 'text/plain' }),
      isPermissionDenied,
    );

    const publicRead = await getDownloadURL(ref(buyer.client.storage, ownerPath));
    assert.equal(publicRead.includes(ownerPath.replaceAll('/', '%2F')), true);
  });
});
