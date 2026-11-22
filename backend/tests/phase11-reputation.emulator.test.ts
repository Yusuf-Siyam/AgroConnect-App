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
  appId: '1:000000000000:web:emulator-phase11-reputation',
};

type Role = 'farmer' | 'buyer' | 'admin';
type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };
type ReputationResponse = {
  farmerId: string;
  score: number | null;
  isNew: boolean;
  reviewCount: number;
  deliveredCount: number;
  cancelledCount: number;
  rejectedCount: number;
  breakdown: {
    rating: { weight: number; componentScore: number; averageRating: number };
    delivered: { weight: number; componentScore: number; deliveredCount: number; decisionCount: number };
    cancelReject: {
      weight: number;
      componentScore: number;
      cancelledCount: number;
      rejectedCount: number;
      decisionCount: number;
    };
  };
};

let server: NetServer;
let baseUrl: string;
let adminServices: FirebaseAdminServices;
let farmer: TestUser;
let newFarmer: TestUser;
let primaryBuyer: TestUser;
let admin: TestUser;
let product: ProductPayload;
let newProduct: ProductPayload;
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
  const profile = {
    uid,
    email,
    displayName: label,
    role,
    isVerified: role === 'admin',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (role === 'admin') {
    await adminServices.auth.setCustomUserClaims(uid, { admin: true, role: 'admin' });
    await adminServices.firestore.collection('users').doc(uid).set(profile);
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

async function expectPermissionDenied(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: { code?: string }) => error.code === 'permission-denied');
}

function productPayload(id: string, sellerId: string): ProductPayload & { sellerId: string } {
  return {
    id,
    sellerId,
    name: { bn: 'চাল', en: 'Rice' },
    category: 'rice',
    description: { bn: 'দেশি চাল', en: 'Local rice' },
    price: 100,
    unit: 'kg',
    stock: 50,
    lowStockThreshold: 5,
    minOrderQty: 1,
    harvestDate: '2026-11-01',
    harvestInfo: { district: 'Dhaka', variety: 'BR-11' },
    images: [],
    status: 'active',
  };
}

async function createProduct(farmerUser: TestUser, payload: ProductPayload & { sellerId: string }): Promise<void> {
  const { sellerId, ...body } = payload;
  assert.equal(sellerId, farmerUser.uid);
  const response = await fetchAs('/api/products', farmerUser.token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201, await response.clone().text());
}

async function seedOrder(
  buyerId: string,
  target: ProductPayload & { sellerId: string },
  status: 'delivered' | 'rejected' | 'cancelled',
  actorRole: 'transporter' | 'farmer',
): Promise<void> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const history = [
    {
      id: randomUUID(),
      from: null,
      to: 'pending',
      actorId: buyerId,
      actorRole: 'buyer',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      from: 'pending',
      to: status,
      actorId: actorRole === 'farmer' ? target.sellerId : `transporter-${randomUUID()}`,
      actorRole,
      createdAt: now,
      updatedAt: now,
    },
  ];
  await adminServices.firestore.collection('orders').doc(id).set({
    id,
    buyerId,
    sellerIds: [target.sellerId],
    items: [
      {
        productId: target.id,
        sellerId: target.sellerId,
        name: target.name,
        quantity: 1,
        unitPrice: target.price,
        unit: target.unit,
      },
    ],
    status,
    totalAmount: target.price,
    deliveryFee: null,
    statusHistory: history,
    createdAt: now,
    updatedAt: now,
  });
}

async function createReview(buyer: TestUser, target: ProductPayload & { sellerId: string }, rating: number): Promise<void> {
  const response = await fetchAs('/api/reviews', buyer.token, {
    method: 'POST',
    body: JSON.stringify({ productId: target.id, rating }),
  });
  assert.equal(response.status, 201, await response.clone().text());
}

async function getReputation(token: string, farmerId: string): Promise<ReputationResponse> {
  const response = await fetchAs(`/api/reputation/${farmerId}`, token);
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()) as ReputationResponse;
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

  farmer = await registerUser('p11-reputation-farmer', 'farmer');
  newFarmer = await registerUser('p11-reputation-new-farmer', 'farmer');
  admin = await registerUser('p11-reputation-admin', 'admin');
  product = productPayload(randomUUID(), farmer.uid);
  newProduct = productPayload(randomUUID(), newFarmer.uid);
  await createProduct(farmer, product);
  await createProduct(newFarmer, newProduct);

  const buyers: TestUser[] = [];
  for (let index = 0; index < 3; index += 1) {
    const buyer = await registerUser(`p11-reputation-buyer-${index}`, 'buyer');
    buyers.push(buyer);
    await seedOrder(buyer.uid, product, 'delivered', 'transporter');
  }
  primaryBuyer = buyers[0];
  const extraBuyer = await registerUser('p11-reputation-extra-buyer', 'buyer');
  await seedOrder(extraBuyer.uid, product, 'delivered', 'transporter');
  await seedOrder(extraBuyer.uid, product, 'rejected', 'farmer');
  const cancelBuyer = await registerUser('p11-reputation-cancel-buyer', 'buyer');
  await seedOrder(cancelBuyer.uid, product, 'cancelled', 'farmer');

  await createReview(buyers[0], product, 5);
  await createReview(buyers[1], product, 4);
  await createReview(buyers[2], product, 4);

  const newBuyer = await registerUser('p11-reputation-new-buyer', 'buyer');
  await seedOrder(newBuyer.uid, newProduct, 'delivered', 'transporter');
  await createReview(newBuyer, newProduct, 5);
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

describe('Phase 11 reputation emulator verification', () => {
  it('computes a score from real reviews and order outcomes', async () => {
    const response = await getReputation(primaryBuyer.token, farmer.uid);

    assert.equal(response.farmerId, farmer.uid);
    assert.equal(response.isNew, false);
    assert.equal(response.reviewCount, 3);
    assert.equal(response.deliveredCount, 4);
    assert.equal(response.rejectedCount, 1);
    assert.equal(response.cancelledCount, 1);
    assert.equal(response.breakdown.rating.averageRating, 4.3);
    assert.equal(response.breakdown.rating.weight, 0.5);
    assert.equal(response.breakdown.delivered.weight, 0.3);
    assert.equal(response.breakdown.cancelReject.weight, 0.2);
    assert.equal(response.score, 76.7);
  });

  it('hides the numeric score below the minimum review count', async () => {
    const response = await getReputation(primaryBuyer.token, newFarmer.uid);

    assert.equal(response.isNew, true);
    assert.equal(response.reviewCount, 1);
    assert.equal(response.score, null);
    assert.equal(response.breakdown.rating.averageRating, 5);
  });

  it('includes only public reputation fields in farmer profiles and product details', async () => {
    const token = primaryBuyer.token;
    const profileResponse = await fetchAs(`/api/farmers/${farmer.uid}`, token);
    const productResponse = await fetchAs(`/api/marketplace/products/${product.id}`, token);
    assert.equal(profileResponse.status, 200);
    assert.equal(productResponse.status, 200);

    const profileText = await profileResponse.clone().text();
    const productText = await productResponse.clone().text();
    for (const forbidden of ['phoneNumber', 'email', 'addressLine', 'deliveryAddress']) {
      assert.equal(profileText.includes(forbidden), false);
      assert.equal(productText.includes(forbidden), false);
    }
    assert.equal(((await profileResponse.json()) as { reputation: ReputationResponse }).reputation.reviewCount, 3);
    assert.equal(((await productResponse.json()) as { reputation: ReputationResponse }).reputation.reviewCount, 3);
  });

  it('recomputes to the same score when an admin repeats the maintenance action', async () => {
    const firstResponse = await fetchAs('/api/admin/reputation/recompute', admin.token, {
      method: 'POST',
      body: JSON.stringify({ farmerId: farmer.uid }),
    });
    const secondResponse = await fetchAs('/api/admin/reputation/recompute', admin.token, {
      method: 'POST',
      body: JSON.stringify({ farmerId: farmer.uid }),
    });
    assert.equal(firstResponse.status, 200, await firstResponse.clone().text());
    assert.equal(secondResponse.status, 200, await secondResponse.clone().text());

    const first = (await firstResponse.json()) as { reputation: ReputationResponse };
    const second = (await secondResponse.json()) as { reputation: ReputationResponse };
    assert.equal(first.reputation.score, second.reputation.score);
    assert.equal(first.reputation.reviewCount, second.reputation.reviewCount);
    assert.equal(first.reputation.deliveredCount, second.reputation.deliveredCount);
  });

  it('denies direct client writes to reviews', async () => {
    const firestore = getFirestore(primaryBuyer.app);

    await expectPermissionDenied(
      setDoc(doc(firestore, 'reviews', `${randomUUID()}_${product.id}`), {
        productId: product.id,
        buyerId: primaryBuyer.uid,
        sellerId: farmer.uid,
        rating: 5,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('denies direct client writes to reputation documents', async () => {
    const firestore = getFirestore(primaryBuyer.app);

    await expectPermissionDenied(
      setDoc(doc(firestore, 'farmerReputation', farmer.uid), {
        farmerId: farmer.uid,
        score: 100,
        isNew: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });
});
