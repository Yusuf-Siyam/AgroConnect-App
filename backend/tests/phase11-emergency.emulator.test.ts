import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server as NetServer } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, setDoc, type Firestore } from 'firebase/firestore';

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
  appId: '1:000000000000:web:emulator-phase11-emergency',
};

type Role = 'farmer' | 'buyer';
type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };

let server: NetServer;
let baseUrl: string;
let admin: FirebaseAdminServices;
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
  await setDoc(doc(firestore, 'users', uid), {
    uid, email, displayName: label, district: 'Dhaka', role, createdAt: ts, updatedAt: ts,
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

async function createProduct(user: TestUser, payload: ProductPayload & { sellerId: string }) {
  const { sellerId, ...body } = payload;
  assert.equal(sellerId, user.uid);
  const res = await fetchAs('/api/products', user.token, { method: 'POST', body: JSON.stringify(body) });
  assert.equal(res.status, 201, await res.clone().text());
}

async function createEmergency(user: TestUser, body: Record<string, unknown>) {
  const res = await fetchAs('/api/emergency-listings', user.token, { method: 'POST', body: JSON.stringify(body) });
  return res;
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
  farmer = await registerUser('p11-em-farmer', 'farmer');
  otherFarmer = await registerUser('p11-em-other', 'farmer');
  buyer = await registerUser('p11-em-buyer', 'buyer');
  product = {
    id: randomUUID(), sellerId: farmer.uid, name: { bn: 'আলু', en: 'Potato' }, category: 'vegetables',
    description: { bn: 'তাজা', en: 'Fresh' }, price: 100, unit: 'kg', stock: 100,
    lowStockThreshold: 5, minOrderQty: 1, harvestDate: '2026-11-01',
    harvestInfo: { district: 'Dhaka', variety: 'Local' }, images: [], status: 'active',
  };
  otherProduct = { ...product, id: randomUUID(), sellerId: otherFarmer.uid, name: { bn: 'টমেটো', en: 'Tomato' } };
  await createProduct(farmer, product);
  await createProduct(otherFarmer, otherProduct);
});

after(async () => {
  for (const app of clientApps.splice(0)) await deleteApp(app);
  if (admin) await deleteAdminApp(admin.app);
  if (server) await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

describe('Phase 11 emergency listing emulator verification', () => {
  it('creates an emergency listing with config-bounded discount and duration', async () => {
    const res = await createEmergency(farmer, {
      productId: product.id, discountPercent: 20, availableQty: 10, expiresInHours: 24,
    });
    assert.equal(res.status, 201, await res.clone().text());
    const body = await res.json() as { discountPercent: number; discountedPrice: number; status: string };
    assert.equal(body.discountPercent, 20);
    assert.equal(body.discountedPrice, 80);
    assert.equal(body.status, 'active');

    const badDiscount = await createEmergency(farmer, {
      productId: otherProduct.id, discountPercent: 4, availableQty: 10, expiresInHours: 24,
    });
    assert.equal(badDiscount.status, 400);
  });

  it('enforces one active emergency listing per product/farmer', async () => {
    const p = { ...product, id: randomUUID(), name: { bn: 'পেঁয়াজ', en: 'Onion' } };
    await createProduct(farmer, p);
    const first = await createEmergency(farmer, { productId: p.id, discountPercent: 10, availableQty: 5, expiresInHours: 24 });
    assert.equal(first.status, 201);
    const second = await createEmergency(farmer, { productId: p.id, discountPercent: 15, availableQty: 5, expiresInHours: 24 });
    assert.equal(second.status, 409);
  });

  it('applies effective emergency price in marketplace/cart and snapshots it in order items', async () => {
    const p = { ...product, id: randomUUID(), name: { bn: 'গাজর', en: 'Carrot' }, price: 200 };
    await createProduct(farmer, p);
    const listingRes = await createEmergency(farmer, { productId: p.id, discountPercent: 25, availableQty: 10, expiresInHours: 24 });
    assert.equal(listingRes.status, 201);
    const listing = await listingRes.json() as { id: string; discountedPrice: number };

    const marketRes = await fetchAs(`/api/marketplace/products/${p.id}`, buyer.token);
    assert.equal(marketRes.status, 200);
    const market = await marketRes.json() as { price: number; emergency?: { id: string } };
    assert.equal(market.price, 150);
    assert.equal(market.emergency?.id, listing.id);

    const cartRes = await fetchAs('/api/cart/items', buyer.token, { method: 'POST', body: JSON.stringify({ productId: p.id, quantity: 2 }) });
    assert.equal(cartRes.status, 201, await cartRes.clone().text());
    const cart = await cartRes.json() as { items: Array<{ unitPrice: number; baseUnitPrice: number; priceSource: string; emergencyListingId?: string; discountPercent?: number; lineTotal: number }> };
    const item = cart.items.find((i) => i.emergencyListingId === listing.id);
    assert.ok(item);
    assert.equal(item!.unitPrice, 150);
    assert.equal(item!.baseUnitPrice, 200);
    assert.equal(item!.priceSource, 'emergency');
    assert.equal(item!.discountPercent, 25);
    assert.equal(item!.lineTotal, 300);

    const orderRes = await fetchAs('/api/orders', buyer.token, {
      method: 'POST',
      body: JSON.stringify({
        checkoutId: randomUUID(),
        deliveryAddress: { addressLine: '12 Farm Road, Mirpur', district: 'Dhaka', phoneNumber: '+8801700000000' },
      }),
    });
    assert.equal(orderRes.status, 201, await orderRes.clone().text());
    const checkout = await orderRes.json() as { orders: Array<{ items: Array<{ productId: string; unitPrice: number; baseUnitPrice: number; emergencyListingId?: string; discountPercent?: number; priceSource: string }> }> };
    const orderItem = checkout.orders.flatMap((o) => o.items).find((i) => i.productId === p.id);
    assert.ok(orderItem);
    assert.equal(orderItem!.unitPrice, 150);
    assert.equal(orderItem!.baseUnitPrice, 200);
    assert.equal(orderItem!.emergencyListingId, listing.id);
    assert.equal(orderItem!.discountPercent, 25);
    assert.equal(orderItem!.priceSource, 'emergency');
  });

  it('expires listings by server time and does not apply expired emergency pricing', async () => {
    const p = { ...product, id: randomUUID(), name: { bn: 'লাউ', en: 'Gourd' }, price: 50 };
    await createProduct(farmer, p);
    const res = await createEmergency(farmer, { productId: p.id, discountPercent: 10, availableQty: 5, expiresInHours: 1 });
    assert.equal(res.status, 201);
    const listing = await res.json() as { id: string };
    await admin.firestore.collection('emergencyListings').doc(listing.id).update({
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const marketRes = await fetchAs(`/api/marketplace/products/${p.id}`, buyer.token);
    assert.equal(marketRes.status, 200);
    const market = await marketRes.json() as { price: number; emergency?: unknown };
    assert.equal(market.price, 50);
    assert.equal(market.emergency, undefined);
  });
});
