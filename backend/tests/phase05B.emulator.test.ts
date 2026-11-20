import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo, Server as NetServer } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';

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
  appId: '1:000000000000:web:emulator-phase5b',
};

type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };
type WeatherCounts = { search: number; forecast: number };

let server: NetServer;
let providerServer: Server;
let providerUrl: string;
let providerCounts: WeatherCounts;
let baseUrl: string;
let admin: FirebaseAdminServices;
let farmer: TestUser;
let otherFarmer: TestUser;
let buyer: TestUser;
const clientApps: FirebaseApp[] = [];

async function registerUser(label: string, role: 'farmer' | 'buyer'): Promise<TestUser> {
  const app = initializeApp(firebaseConfig, `${label}-${randomUUID()}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);

  const email = `${label}-${randomUUID()}@example.com`;
  const credential = await createUserWithEmailAndPassword(auth, email, 'phase5-password-123');
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
    category: 'cereal',
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

async function createProduct(owner: TestUser, overrides: Partial<ProductPayload> = {}): Promise<ProductPayload> {
  const payload = productPayload(overrides);
  const response = await fetchAs('/api/products', owner.token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return payload;
}

async function createOrder(input: {
  sellerId: string;
  productId: string;
  quantity: number;
  status?: string;
  unitPrice?: number;
}): Promise<string> {
  const orderId = randomUUID();
  const unitPrice = input.unitPrice ?? 10;
  await admin.firestore.collection('orders').doc(orderId).set({
    id: orderId,
    buyerId: `buyer-${randomUUID()}`,
    sellerIds: [input.sellerId],
    items: [
      {
        productId: input.productId,
        sellerId: input.sellerId,
        name: { bn: 'চাল', en: 'Rice' },
        quantity: input.quantity,
        unitPrice,
        unit: 'kg',
      },
    ],
    status: input.status ?? 'pending',
    totalAmount: input.quantity * unitPrice,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return orderId;
}

function startWeatherProvider(): Promise<void> {
  providerCounts = { search: 0, forecast: 0 };
  providerServer = createServer((request, response) => {
    const url = new URL(request.url ?? '/', providerUrl);
    response.setHeader('Content-Type', 'application/json');

    if (url.pathname === '/search') {
      providerCounts.search += 1;
      const name = (url.searchParams.get('name') ?? '').toLowerCase();
      response.end(
        JSON.stringify(
          name === 'dhaka'
            ? { results: [{ name: 'Dhaka', latitude: 23.8, longitude: 90.4 }] }
            : { results: [] },
        ),
      );
      return;
    }

    if (url.pathname === '/forecast') {
      providerCounts.forecast += 1;
      response.end(
        JSON.stringify({
          latitude: Number(url.searchParams.get('latitude')),
          longitude: Number(url.searchParams.get('longitude')),
          current: {
            time: '2026-11-20T12:00',
            temperature_2m: 30,
            relative_humidity_2m: 70,
            wind_speed_10m: 12,
            weather_code: 2,
          },
          daily: {
            time: ['2026-11-20', '2026-11-21'],
            weather_code: [2, 3],
            temperature_2m_max: [32, 31],
            temperature_2m_min: [24, 23],
          },
        }),
      );
      return;
    }

    response.statusCode = 404;
    response.end('{}');
  });

  return new Promise((resolve) => {
    providerServer.listen(0, '127.0.0.1', () => {
      const address = providerServer.address() as AddressInfo;
      providerUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

before(async () => {
  await startWeatherProvider();

  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
  process.env.OPEN_METEO_FORECAST_URL = `${providerUrl}/forecast`;
  process.env.OPEN_METEO_GEOCODING_URL = `${providerUrl}/search`;
  process.env.WEATHER_CACHE_TTL_MS = '600000';
  process.env.WEATHER_REQUEST_TIMEOUT_MS = '2000';

  const { createApp } = await import('../src/app.js');
  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
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
  if (providerServer) await new Promise<void>((resolve) => providerServer.close(() => resolve()));
});

describe('Phase 05B emulator verification', () => {
  it('registers every farmer endpoint and validates requests with Zod', async () => {
    farmer = await registerUser('farmer-b5', 'farmer');
    buyer = await registerUser('buyer-b5', 'buyer');

    for (const path of ['/api/orders', '/api/analytics/farmer', '/api/weather?district=Dhaka']) {
      const forbidden = await fetchAs(path, buyer.token);
      assert.equal(forbidden.status, 403, `${path}: ${await forbidden.clone().text()}`);
      assert.equal(await errorCode(forbidden), 'FORBIDDEN');
    }

    const badOrderQuery = await fetchAs('/api/orders?limit=0', farmer.token);
    assert.equal(badOrderQuery.status, 400);
    assert.equal(await errorCode(badOrderQuery), 'VALIDATION_ERROR');

    const badRejectBody = await fetchAs(`/api/orders/${randomUUID()}/reject`, farmer.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'no' }),
    });
    assert.equal(badRejectBody.status, 400);
    assert.equal(await errorCode(badRejectBody), 'VALIDATION_ERROR');

    const badWeatherQuery = await fetchAs('/api/weather?lat=25', farmer.token);
    assert.equal(badWeatherQuery.status, 400);
    assert.equal(await errorCode(badWeatherQuery), 'VALIDATION_ERROR');
  });

  it('adjusts stock transactionally, blocks negative stock and records history', async () => {
    otherFarmer = await registerUser('farmer-b5-other', 'farmer');
    const product = await createProduct(farmer, { stock: 7 });

    const negative = await fetchAs(`/api/products/${product.id}/stock`, farmer.token, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: -1, reason: 'mistake' }),
    });
    assert.equal(negative.status, 400);
    assert.equal(await errorCode(negative), 'VALIDATION_ERROR');

    const adjust = await fetchAs(`/api/products/${product.id}/stock`, farmer.token, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: 4, reason: 'stock count' }),
    });
    assert.equal(adjust.status, 200, await adjust.clone().text());
    let stored = (await adjust.json()) as { stock: number; status: string };
    assert.equal(stored.stock, 4);
    assert.equal(stored.status, 'active');

    const zero = await fetchAs(`/api/products/${product.id}/stock`, farmer.token, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: 0, reason: 'sold out' }),
    });
    assert.equal(zero.status, 200);
    stored = (await zero.json()) as { stock: number; status: string };
    assert.equal(stored.stock, 0);
    assert.equal(stored.status, 'out_of_stock');

    const historyResponse = await fetchAs(
      `/api/products/${product.id}/stock-history?limit=20`,
      farmer.token,
    );
    assert.equal(historyResponse.status, 200);
    const history = (await historyResponse.json()) as {
      previousQuantity: number;
      newQuantity: number;
      reason: string;
    }[];
    assert.equal(history.length, 2);
    assert.equal(history[0]?.newQuantity, 0);
    assert.equal(history[1]?.newQuantity, 4);

    const foreign = await fetchAs(`/api/products/${product.id}/stock`, otherFarmer.token, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: 2, reason: 'not mine' }),
    });
    assert.equal(foreign.status, 404);
    assert.equal(await errorCode(foreign), 'PRODUCT_NOT_FOUND');
  });

  it('accepts and rejects only pending owned orders, re-checking stock', async () => {
    const product = await createProduct(farmer, { stock: 5 });
    const orderId = await createOrder({ sellerId: farmer.uid, productId: product.id, quantity: 3 });

    const list = await fetchAs('/api/orders?status=pending&limit=20', farmer.token);
    assert.equal(list.status, 200);
    const listed = (await list.json()) as { items: { id: string }[]; total: number };
    assert.ok(listed.items.some((item) => item.id === orderId));
    assert.ok(listed.total >= 1);

    const foreignOrder = await createOrder({
      sellerId: otherFarmer.uid,
      productId: product.id,
      quantity: 1,
    });
    await admin.firestore.collection('orders').doc(foreignOrder).update({
      sellerIds: [otherFarmer.uid],
      items: [
        {
          productId: product.id,
          sellerId: otherFarmer.uid,
          name: { en: 'Rice' },
          quantity: 1,
          unitPrice: 10,
          unit: 'kg',
        },
      ],
    });
    const foreignRead = await fetchAs(`/api/orders/${foreignOrder}`, farmer.token);
    assert.equal(foreignRead.status, 404);
    assert.equal(await errorCode(foreignRead), 'ORDER_NOT_FOUND');

    const rejectId = await createOrder({ sellerId: farmer.uid, productId: product.id, quantity: 1 });
    const rejected = await fetchAs(`/api/orders/${rejectId}/reject`, farmer.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Unable to fulfil this order' }),
    });
    assert.equal(rejected.status, 200, await rejected.clone().text());
    let rejectedOrder = (await rejected.json()) as { status: string; rejectionReason?: string };
    assert.equal(rejectedOrder.status, 'rejected');
    assert.equal(rejectedOrder.rejectionReason, 'Unable to fulfil this order');

    const lateAccept = await fetchAs(`/api/orders/${rejectId}/accept`, farmer.token, {
      method: 'POST',
    });
    assert.equal(lateAccept.status, 409);
    assert.equal(await errorCode(lateAccept), 'INVALID_ORDER_TRANSITION');

    const tooLargeId = await createOrder({ sellerId: farmer.uid, productId: product.id, quantity: 99 });
    const insufficient = await fetchAs(`/api/orders/${tooLargeId}/accept`, farmer.token, {
      method: 'POST',
    });
    assert.equal(insufficient.status, 409);
    assert.equal(await errorCode(insufficient), 'INSUFFICIENT_STOCK');
    assert.equal(
      (await admin.firestore.collection('orders').doc(tooLargeId).get()).get('status'),
      'pending',
    );

    const accepted = await fetchAs(`/api/orders/${orderId}/accept`, farmer.token, {
      method: 'POST',
    });
    assert.equal(accepted.status, 200, await accepted.clone().text());
    rejectedOrder = (await accepted.json()) as { status: string };
    assert.equal(rejectedOrder.status, 'accepted');

    const rawOrder = (await admin.firestore.collection('orders').doc(orderId).get()).data()!;
    assert.equal(rawOrder.status, 'accepted');
    assert.equal(rawOrder.paidAt, undefined);
    assert.equal(rawOrder.shippedAt, undefined);
    assert.equal(rawOrder.deliveredAt, undefined);

    const productAfter = (await admin.firestore.collection('products').doc(product.id).get()).data()!;
    assert.equal(productAfter.stock, 2);

    const history = await admin.firestore
      .collection('products')
      .doc(product.id)
      .collection('stockHistory')
      .where('reason', '==', `Order ${orderId} accepted`)
      .get();
    assert.equal(history.size, 1);
    assert.equal(history.docs[0]?.get('newQuantity'), 2);
  });

  it('reports analytics from real orders and payments', async () => {
    const analyticsFarmer = await registerUser('farmer-b5-analytics', 'farmer');
    const product = await createProduct(analyticsFarmer, { stock: 20 });
    const paidOne = await createOrder({
      sellerId: analyticsFarmer.uid,
      productId: product.id,
      quantity: 2,
      unitPrice: 50,
      status: 'accepted',
    });
    const paidTwo = await createOrder({
      sellerId: analyticsFarmer.uid,
      productId: product.id,
      quantity: 1,
      unitPrice: 50,
      status: 'delivered',
    });
    await createOrder({
      sellerId: analyticsFarmer.uid,
      productId: product.id,
      quantity: 4,
      status: 'pending',
    });

    for (const [orderId, amount] of [
      [paidOne, 100],
      [paidTwo, 50],
    ] as const) {
      await admin.firestore.collection('payments').doc(randomUUID()).set({
        orderId,
        sellerId: analyticsFarmer.uid,
        amount,
        status: 'completed',
      });
    }
    await admin.firestore.collection('payments').doc(randomUUID()).set({
      orderId: paidOne,
      sellerId: analyticsFarmer.uid,
      amount: 100,
      status: 'failed',
    });

    const response = await fetchAs('/api/analytics/farmer', analyticsFarmer.token);
    assert.equal(response.status, 200, await response.clone().text());
    const summary = (await response.json()) as {
      revenue: number;
      paidOrders: number;
      statusCounts: Record<string, number>;
      topProducts: { quantity: number; revenue: number }[];
      last7Days: { orders: number; revenue: number };
    };
    assert.equal(summary.revenue, 150);
    assert.equal(summary.paidOrders, 2);
    assert.equal(summary.statusCounts.pending, 1);
    assert.equal(summary.statusCounts.accepted, 1);
    assert.equal(summary.statusCounts.delivered, 1);
    assert.equal(summary.topProducts[0]?.quantity, 3);
    assert.equal(summary.topProducts[0]?.revenue, 150);
    assert.equal(summary.last7Days.orders, 3);
    assert.equal(summary.last7Days.revenue, 150);
  });

  it('reads only stored market history and validates market queries', async () => {
    const crop = `Crop-${randomUUID()}`;
    const district = 'Dhaka';

    const empty = await fetchAs(`/api/market?crop=${encodeURIComponent(crop)}`, farmer.token);
    assert.equal(empty.status, 200);
    assert.equal(((await empty.json()) as { total: number }).total, 0);

    const badDate = await fetchAs('/api/market?from=20-11-2026', farmer.token);
    assert.equal(badDate.status, 400);
    assert.equal(await errorCode(badDate), 'VALIDATION_ERROR');

    await admin.firestore.collection('priceHistory').doc(randomUUID()).set({
      crop,
      district,
      date: '2026-11-18',
      price: 42,
      unit: 'kg',
      source: 'District market office observation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const populated = await fetchAs(
      `/api/market?crop=${encodeURIComponent(crop)}&district=${district}`,
      farmer.token,
    );
    assert.equal(populated.status, 200);
    const result = (await populated.json()) as {
      total: number;
      items: { crop: string; district: string; price: number; source: string }[];
    };
    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.price, 42);
    assert.equal(result.items[0]?.source, 'District market office observation');
  });

  it('proxies weather with a timeout, cache and district fallback', async () => {
    const first = await fetchAs('/api/weather?district=Dhaka', farmer.token);
    assert.equal(first.status, 200, await first.clone().text());
    const weather = (await first.json()) as {
      locationSource: string;
      locationLabel: string;
      daily: unknown[];
      current: { temperature: number };
    };
    assert.equal(weather.locationSource, 'district');
    assert.equal(weather.locationLabel, 'Dhaka');
    assert.equal(weather.daily.length, 2);
    assert.equal(weather.current.temperature, 30);
    assert.equal(providerCounts.search, 1);
    assert.equal(providerCounts.forecast, 1);

    const cached = await fetchAs('/api/weather?district=dhaka', farmer.token);
    assert.equal(cached.status, 200);
    assert.equal(providerCounts.search, 1);
    assert.equal(providerCounts.forecast, 1);

    const gps = await fetchAs('/api/weather?lat=23.8&lon=90.4', farmer.token);
    assert.equal(gps.status, 200);
    const gpsBody = (await gps.json()) as { locationSource: string };
    assert.equal(gpsBody.locationSource, 'gps');
    assert.equal(providerCounts.forecast, 1);

    const missing = await fetchAs('/api/weather?district=UnknownDistrictName', farmer.token);
    assert.equal(missing.status, 404);
    assert.equal(await errorCode(missing), 'DISTRICT_NOT_FOUND');
  });
});
