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
  setDoc,
  type Firestore,
} from 'firebase/firestore';

import type { FirebaseAdminServices } from '../src/config/firebase';
import type { PushProvider } from '../src/types/notification';
import type { ProductPayload } from '../../src/features/farmer/schemas';

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

const firebaseConfig = {
  apiKey: 'emulator-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: '1:000000000000:web:emulator-phase10g',
};

type Role = 'farmer' | 'buyer' | 'transporter' | 'admin';
type Locale = 'bn' | 'en';
type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };
type PushCall = { userId: string; title: string; body: string; data: Record<string, string> };

let server: NetServer;
let baseUrl: string;
let admin: FirebaseAdminServices;
let createDeliveryJobForOrder: typeof import('../src/services/delivery.js').createDeliveryJobForOrder;
let setTransporterVerification: typeof import('../src/services/transporter.js').setTransporterVerification;
let pushCalls: PushCall[] = [];
let pushShouldFail = false;

const pushProvider: PushProvider = {
  async send(userId, _tokens, message) {
    pushCalls.push({ userId, title: message.title, body: message.body, data: message.data });
    if (pushShouldFail) throw new Error('Test notification outage');
  },
};

const clientApps: FirebaseApp[] = [];

async function registerUser(
  label: string,
  role: Role,
  preferredLanguage?: Locale,
): Promise<TestUser> {
  const app = initializeApp(firebaseConfig, `${label}-${randomUUID()}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);

  const email = `${label}-${randomUUID()}@example.com`;
  const credential = await createUserWithEmailAndPassword(auth, email, 'phase10-password-123');
  const uid = credential.user.uid;
  if (role === 'admin') {
    await admin.auth.setCustomUserClaims(uid, { admin: true, role: 'admin' });
  }
  const timestamp = new Date().toISOString();
  const profile: Record<string, unknown> = {
    uid,
    email,
    displayName: label,
    role,
    isVerified: role === 'admin',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  if (preferredLanguage) profile.preferredLanguage = preferredLanguage;
  if (role === 'admin') {
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

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function errorCode(response: Response): Promise<string> {
  return (await json<{ error: { code: string } }>(response)).error.code;
}

async function expectPermissionDenied(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) =>
      Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied'),
  );
}

function productPayload(overrides: Partial<ProductPayload> = {}): ProductPayload {
  return {
    id: randomUUID(),
    name: { bn: 'চাল', en: 'Rice' },
    category: 'rice',
    description: { bn: 'দেশি চাল', en: 'Local rice' },
    price: 100,
    unit: 'kg',
    stock: 20,
    lowStockThreshold: 2,
    minOrderQty: 1,
    harvestDate: '2026-11-01',
    harvestInfo: { district: 'Dhaka', variety: 'BR-11' },
    images: [],
    status: 'active',
    ...overrides,
  };
}

async function createProduct(farmer: TestUser): Promise<ProductPayload> {
  const payload = productPayload();
  const response = await fetchAs('/api/products', farmer.token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return payload;
}

async function checkout(buyer: TestUser, farmer: TestUser): Promise<string[]> {
  const product = await createProduct(farmer);
  const added = await fetchAs('/api/cart/items', buyer.token, {
    method: 'POST',
    body: JSON.stringify({ productId: product.id, quantity: 1 }),
  });
  assert.equal(added.status, 201, await added.clone().text());
  const response = await fetchAs('/api/orders', buyer.token, {
    method: 'POST',
    body: JSON.stringify({
      checkoutId: randomUUID(),
      deliveryAddress: {
        addressLine: '12 Farm Road, Mirpur',
        district: 'Dhaka',
        phoneNumber: '+8801712345678',
      },
    }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return (await json<{ orderIds: string[] }>(response)).orderIds;
}

function paidOrderFixture(buyer: TestUser, farmer: TestUser): Record<string, unknown> {
  const at = new Date().toISOString();
  return {
    id: randomUUID(),
    buyerId: buyer.uid,
    sellerIds: [farmer.uid],
    items: [
      {
        productId: randomUUID(),
        sellerId: farmer.uid,
        name: { bn: 'চাল', en: 'Rice' },
        quantity: 1,
        unitPrice: 100,
        unit: 'kg',
      },
    ],
    status: 'paid',
    totalAmount: 100,
    deliveryFee: 60,
    pickupAddress: {
      addressLine: '1 Farm Road, Savar',
      district: 'Dhaka',
      latitude: 23.8586,
      longitude: 90.2527,
    },
    deliveryAddress: {
      addressLine: '12 Buyer Road, Dhaka',
      district: 'Dhaka',
      phoneNumber: '+8801712345678',
      latitude: 23.8103,
      longitude: 90.4125,
    },
    statusHistory: [],
    createdAt: at,
    updatedAt: at,
  };
}

async function seedPaidOrderWithJob(buyer: TestUser, farmer: TestUser): Promise<{ orderId: string; jobId: string }> {
  const order = paidOrderFixture(buyer, farmer);
  await admin.firestore.collection('orders').doc(String(order.id)).set(order);
  const job = await createDeliveryJobForOrder(order as never);
  return { orderId: String(order.id), jobId: job.id };
}

async function verifiedTransporter(label: string): Promise<TestUser> {
  const transporter = await registerUser(label, 'transporter');
  const profile = await fetchAs('/api/delivery/transporter-profile', transporter.token, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Transporter',
      phone: '+8801712345678',
      district: 'Dhaka',
      vehicleType: 'motorcycle',
      plateNumber: 'DH-10-1234',
      capacityKg: 50,
    }),
  });
  assert.equal(profile.status, 201, await profile.clone().text());
  await setTransporterVerification(transporter.uid, 'verified');
  return transporter;
}

async function postJob(transporter: TestUser, jobId: string, action: string, body?: unknown): Promise<Response> {
  return fetchAs(`/api/delivery/jobs/${jobId}/${action}`, transporter.token, {
    method: 'POST',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function registerDevice(user: TestUser, token: string): Promise<void> {
  const response = await fetchAs('/api/notifications/devices', user.token, {
    method: 'POST',
    body: JSON.stringify({ token, platform: 'android' }),
  });
  assert.equal(response.status, 204, await response.clone().text());
}

async function notificationsFor(userId: string): Promise<Array<Record<string, any>>> {
  const snapshot = await admin.firestore
    .collection('notifications')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

async function createConversation(user: TestUser, body: Record<string, unknown>): Promise<string> {
  const response = await fetchAs('/api/chat/conversations', user.token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 201, await response.clone().text());
  return (await json<{ id: string }>(response)).id;
}

async function sendMessage(
  user: TestUser,
  chatId: string,
  text: string,
  clientMessageId?: string,
): Promise<Response> {
  return fetchAs(`/api/chat/conversations/${chatId}/messages`, user.token, {
    method: 'POST',
    body: JSON.stringify({ text, ...(clientMessageId ? { clientMessageId } : {}) }),
  });
}

async function getChat(user: TestUser, chatId: string): Promise<Response> {
  return fetchAs(`/api/chat/conversations/${chatId}`, user.token);
}

async function listMessages(user: TestUser, chatId: string, cursor?: string): Promise<Response> {
  const query = new URLSearchParams({ limit: '2' });
  if (cursor) query.set('cursor', cursor);
  return fetchAs(`/api/chat/conversations/${chatId}/messages?${query.toString()}`, user.token);
}

async function listNotifications(
  user: TestUser,
  params: Record<string, string> = {},
): Promise<Response> {
  const query = new URLSearchParams(params);
  return fetchAs(`/api/notifications?${query.toString()}`, user.token);
}

before(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
  process.env.CHAT_MESSAGES_PER_MINUTE = '30';

  const { createApp } = await import('../src/app.js');
  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
  const deliveryService = await import('../src/services/delivery.js');
  const transporterService = await import('../src/services/transporter.js');
  createDeliveryJobForOrder = deliveryService.createDeliveryJobForOrder;
  setTransporterVerification = transporterService.setTransporterVerification;
  admin = getFirebaseAdmin();
  server = createApp({ pushProvider }).listen(0);
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

describe('Phase 10 gap emulator verification', () => {
  it('notifies the farmer when a buyer places an order without storing a delivery code', async () => {
    const buyer = await registerUser('p10g-placed-buyer', 'buyer');
    const farmer = await registerUser('p10g-placed-farmer', 'farmer');
    const orderIds = await checkout(buyer, farmer);

    const records = await notificationsFor(farmer.uid);
    assert.equal(records.length, 1);
    assert.equal(records[0]!.type, 'order_placed');
    assert.deepEqual(records[0]!.params, { orderId: orderIds[0] });
    assert.equal(records[0]!.target.orderId, orderIds[0]);
    assert.ok(!JSON.stringify(records[0]!.params).toLowerCase().includes('code'));
    assert.equal((await notificationsFor(buyer.uid)).length, 0);
  });

  it('notifies the buyer when the farmer accepts an order', async () => {
    const buyer = await registerUser('p10g-accepted-buyer', 'buyer');
    const farmer = await registerUser('p10g-accepted-farmer', 'farmer');
    const orderId = (await checkout(buyer, farmer))[0]!;

    const response = await fetchAs(`/api/orders/${orderId}/accept`, farmer.token, { method: 'POST' });
    assert.equal(response.status, 200, await response.clone().text());

    const records = await notificationsFor(buyer.uid);
    assert.equal(records.length, 1);
    assert.equal(records[0]!.type, 'order_accepted');
    assert.deepEqual(records[0]!.params, { orderId });
  });

  it('notifies the buyer when the farmer rejects an order', async () => {
    const buyer = await registerUser('p10g-rejected-buyer', 'buyer');
    const farmer = await registerUser('p10g-rejected-farmer', 'farmer');
    const orderId = (await checkout(buyer, farmer))[0]!;

    const response = await fetchAs(`/api/orders/${orderId}/reject`, farmer.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Out of stock today' }),
    });
    assert.equal(response.status, 200, await response.clone().text());

    const records = await notificationsFor(buyer.uid);
    assert.equal(records.length, 1);
    assert.equal(records[0]!.type, 'order_rejected');
    assert.deepEqual(records[0]!.params, { orderId });
  });

  it('notifies the farmer when the buyer cancels an order', async () => {
    const buyer = await registerUser('p10g-cancelled-buyer', 'buyer');
    const farmer = await registerUser('p10g-cancelled-farmer', 'farmer');
    const orderId = (await checkout(buyer, farmer))[0]!;

    const response = await fetchAs(`/api/orders/${orderId}/cancel`, buyer.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Changed my mind' }),
    });
    assert.equal(response.status, 200, await response.clone().text());

    const records = await notificationsFor(farmer.uid);
    const cancelled = records.find((entry) => entry.type === 'order_cancelled');
    assert.ok(cancelled);
    assert.deepEqual(cancelled!.params, { orderId });
  });

  it('notifies the buyer and farmer when a transporter accepts a delivery job', async () => {
    const buyer = await registerUser('p10g-job-buyer', 'buyer');
    const farmer = await registerUser('p10g-job-farmer', 'farmer');
    const transporter = await verifiedTransporter('p10g-job-transporter');
    const { orderId, jobId } = await seedPaidOrderWithJob(buyer, farmer);

    const response = await postJob(transporter, jobId, 'accept');
    assert.equal(response.status, 200, await response.clone().text());

    for (const userId of [buyer.uid, farmer.uid]) {
      const records = await notificationsFor(userId);
      assert.equal(records.length, 1);
      assert.equal(records[0]!.type, 'job_accepted');
      assert.deepEqual(records[0]!.params, { orderId });
    }
  });

  it('says the delivery code is ready without storing the code when a job is collected', async () => {
    pushCalls = [];
    const buyer = await registerUser('p10g-collected-buyer', 'buyer', 'en');
    const farmer = await registerUser('p10g-collected-farmer', 'farmer');
    const transporter = await verifiedTransporter('p10g-collected-transporter');
    await registerDevice(buyer, 'fcm-collected-buyer');
    const { orderId, jobId } = await seedPaidOrderWithJob(buyer, farmer);
    assert.equal((await postJob(transporter, jobId, 'accept')).status, 200);

    const response = await postJob(transporter, jobId, 'collect');
    assert.equal(response.status, 200, await response.clone().text());
    const job = await admin.firestore.collection('deliveryJobs').doc(jobId).get();
    const code = String(job.data()?.deliveryCode ?? '');
    assert.match(code, /^\d{6}$/);

    const records = await notificationsFor(buyer.uid);
    const collected = records.find((entry) => entry.type === 'order_collected');
    assert.ok(collected);
    assert.deepEqual(collected!.params, { orderId });
    assert.ok(!JSON.stringify(collected).includes(code));
    const call = pushCalls.find((entry) => entry.userId === buyer.uid && /code is ready/i.test(entry.body));
    assert.ok(call);
    assert.ok(!call!.body.includes(code));
    assert.ok(!call!.data.code);
  });

  it('notifies the buyer when a delivery is shipped', async () => {
    const buyer = await registerUser('p10g-shipped-buyer', 'buyer');
    const farmer = await registerUser('p10g-shipped-farmer', 'farmer');
    const transporter = await verifiedTransporter('p10g-shipped-transporter');
    const { orderId, jobId } = await seedPaidOrderWithJob(buyer, farmer);
    assert.equal((await postJob(transporter, jobId, 'accept')).status, 200);
    assert.equal((await postJob(transporter, jobId, 'collect')).status, 200);

    const response = await postJob(transporter, jobId, 'ship');
    assert.equal(response.status, 200, await response.clone().text());

    const records = await notificationsFor(buyer.uid);
    const shipped = records.find((entry) => entry.type === 'order_shipped');
    assert.ok(shipped);
    assert.deepEqual(shipped!.params, { orderId });
  });

  it('notifies the buyer and farmer when a delivery is delivered', async () => {
    const buyer = await registerUser('p10g-delivered-buyer', 'buyer');
    const farmer = await registerUser('p10g-delivered-farmer', 'farmer');
    const transporter = await verifiedTransporter('p10g-delivered-transporter');
    const { orderId, jobId } = await seedPaidOrderWithJob(buyer, farmer);
    assert.equal((await postJob(transporter, jobId, 'accept')).status, 200);
    assert.equal((await postJob(transporter, jobId, 'collect')).status, 200);
    assert.equal((await postJob(transporter, jobId, 'ship')).status, 200);
    const job = await admin.firestore.collection('deliveryJobs').doc(jobId).get();

    const response = await postJob(transporter, jobId, 'deliver', { code: job.data()?.deliveryCode });
    assert.equal(response.status, 200, await response.clone().text());

    for (const userId of [buyer.uid, farmer.uid]) {
      const records = await notificationsFor(userId);
      const delivered = records.find((entry) => entry.type === 'order_delivered');
      assert.ok(delivered);
      assert.deepEqual(delivered!.params, { orderId });
    }
  });

  it('lists notifications with pagination and an unread-only filter for the owner', async () => {
    const buyer = await registerUser('p10g-list-buyer', 'buyer');
    const farmer = await registerUser('p10g-list-farmer', 'farmer');
    const chatId = await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid });
    for (const text of ['one', 'two', 'three']) {
      assert.equal((await sendMessage(buyer, chatId, text)).status, 201);
    }
    const all = await notificationsFor(farmer.uid);
    assert.equal(all.length, 3);
    const readId = all[2]!.id;
    assert.equal(
      (await fetchAs(`/api/notifications/${readId}/read`, farmer.token, { method: 'POST' })).status,
      204,
    );

    const page = await json<{ items: Array<{ id: string }>; total: number; limit: number; offset: number }>(
      await listNotifications(farmer, { limit: '2', offset: '1' }),
    );
    assert.equal(page.total, 3);
    assert.equal(page.limit, 2);
    assert.equal(page.offset, 1);
    assert.equal(page.items.length, 2);

    const unread = await json<{ items: Array<{ readAt: string | null }>; total: number }>(
      await listNotifications(farmer, { unread: 'true' }),
    );
    assert.equal(unread.total, 2);
    assert.ok(unread.items.every((entry) => entry.readAt === null));
  });

  it('returns the unread notification count for the owner only', async () => {
    const buyer = await registerUser('p10g-count-buyer', 'buyer');
    const farmer = await registerUser('p10g-count-farmer', 'farmer');
    const stranger = await registerUser('p10g-count-stranger', 'buyer');
    const chatId = await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid });
    assert.equal((await sendMessage(buyer, chatId, 'one')).status, 201);
    assert.equal((await sendMessage(buyer, chatId, 'two')).status, 201);

    const first = (await notificationsFor(farmer.uid))[0]!.id;
    assert.equal((await fetchAs(`/api/notifications/${first}/read`, farmer.token, { method: 'POST' })).status, 204);

    assert.deepEqual(await json(await fetchAs('/api/notifications/unread-count', farmer.token)), { count: 1 });
    assert.deepEqual(await json(await fetchAs('/api/notifications/unread-count', stranger.token)), { count: 0 });
    assert.equal((await fetchAs('/api/notifications/unread-count')).status, 401);
  });

  it("marks all of the owner's notifications read without touching other users' notifications", async () => {
    const buyerOne = await registerUser('p10g-readall-buyer-one', 'buyer');
    const buyerTwo = await registerUser('p10g-readall-buyer-two', 'buyer');
    const farmer = await registerUser('p10g-readall-farmer', 'farmer');
    for (const buyer of [buyerOne, buyerTwo]) {
      const chatId = await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid });
      assert.equal((await sendMessage(buyer, chatId, 'please read')).status, 201);
    }

    const response = await fetchAs('/api/notifications/read-all', farmer.token, { method: 'POST' });
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(await json(response), { updated: 2 });
    assert.equal((await json<{ count: number }>(await fetchAs('/api/notifications/unread-count', farmer.token))).count, 0);

    const buyerRecords = await notificationsFor(buyerOne.uid);
    assert.deepEqual(buyerRecords, []);
  });

  it('denies cross-user notification reads and direct Firestore notification reads', async () => {
    const buyer = await registerUser('p10g-owner-buyer', 'buyer');
    const farmer = await registerUser('p10g-owner-farmer', 'farmer');
    const stranger = await registerUser('p10g-owner-stranger', 'buyer');
    const chatId = await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid });
    assert.equal((await sendMessage(buyer, chatId, 'private')).status, 201);
    const notificationId = (await notificationsFor(farmer.uid))[0]!.id;

    const list = await json<{ items: unknown[]; total: number }>(await listNotifications(stranger));
    assert.equal(list.total, 0);
    assert.equal(list.items.length, 0);
    await expectPermissionDenied(getDoc(doc(stranger.firestore, 'notifications', notificationId)));
    assert.equal((await getDoc(doc(farmer.firestore, 'notifications', notificationId))).exists(), true);
    assert.equal((await fetchAs('/api/notifications')).status, 401);
  });

  it('blocks sending in a delivery chat after delivery while reading still works', async () => {
    const buyer = await registerUser('p10g-chatclosed-buyer', 'buyer');
    const farmer = await registerUser('p10g-chatclosed-farmer', 'farmer');
    const transporter = await verifiedTransporter('p10g-chatclosed-transporter');
    const { orderId, jobId } = await seedPaidOrderWithJob(buyer, farmer);
    assert.equal((await postJob(transporter, jobId, 'accept')).status, 200);
    const chatId = await createConversation(buyer, { type: 'buyer_transporter', orderId });
    assert.equal((await sendMessage(buyer, chatId, 'before delivery')).status, 201);

    assert.equal((await postJob(transporter, jobId, 'collect')).status, 200);
    assert.equal((await postJob(transporter, jobId, 'ship')).status, 200);
    const job = await admin.firestore.collection('deliveryJobs').doc(jobId).get();
    assert.equal((await postJob(transporter, jobId, 'deliver', { code: job.data()?.deliveryCode })).status, 200);

    const blocked = await sendMessage(buyer, chatId, 'after delivery');
    assert.equal(blocked.status, 409);
    assert.equal(await errorCode(blocked), 'CHAT_CLOSED');
    const history = await listMessages(buyer, chatId);
    assert.equal(history.status, 200);
    assert.equal((await json<{ items: Array<{ text: string }> }>(history)).items[0]!.text, 'before delivery');
  });

  it('does not create a duplicate message for a repeated clientMessageId', async () => {
    const buyer = await registerUser('p10g-idem-buyer', 'buyer');
    const farmer = await registerUser('p10g-idem-farmer', 'farmer');
    const chatId = await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid });
    const clientMessageId = 'client-msg-1';

    const first = await sendMessage(buyer, chatId, 'once', clientMessageId);
    assert.equal(first.status, 201, await first.clone().text());
    const second = await sendMessage(buyer, chatId, 'once', clientMessageId);
    assert.equal(second.status, 200, await second.clone().text());

    const firstId = (await json<{ id: string }>(first)).id;
    assert.equal((await json<{ id: string }>(second)).id, firstId);
    const snapshot = await admin.firestore.collection('chats').doc(chatId).collection('messages').get();
    assert.equal(snapshot.size, 1);
    const chat = await json<{ unreadCounts: Record<string, number> }>(await getChat(farmer, chatId));
    assert.equal(chat.unreadCounts[farmer.uid], 1);
  });

  it('increments the unread count once for each of two simultaneous messages', async () => {
    const buyer = await registerUser('p10g-concurrent-buyer', 'buyer');
    const farmer = await registerUser('p10g-concurrent-farmer', 'farmer');
    const chatId = await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid });

    const responses = await Promise.all([
      sendMessage(buyer, chatId, 'simultaneous one'),
      sendMessage(buyer, chatId, 'simultaneous two'),
    ]);
    assert.deepEqual(responses.map((entry) => entry.status), [201, 201]);

    const snapshot = await admin.firestore.collection('chats').doc(chatId).collection('messages').get();
    assert.equal(snapshot.size, 2);
    const chat = await json<{ unreadCounts: Record<string, number> }>(await getChat(farmer, chatId));
    assert.equal(chat.unreadCounts[farmer.uid], 2);
  });

  it('paginates messages by cursor in order without duplicates or gaps', async () => {
    const buyer = await registerUser('p10g-cursor-buyer', 'buyer');
    const farmer = await registerUser('p10g-cursor-farmer', 'farmer');
    const chatId = await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid });
    for (const text of ['m1', 'm2', 'm3', 'm4', 'm5']) {
      assert.equal((await sendMessage(buyer, chatId, text)).status, 201);
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      const body = await json<{
        items: Array<{ id: string; text: string }>;
        nextCursor: string | null;
      }>(await listMessages(buyer, chatId, cursor));
      seen.push(...body.items.map((entry) => entry.text));
      cursor = body.nextCursor ?? undefined;
      if (!cursor) break;
    }

    assert.deepEqual(seen, ['m1', 'm2', 'm3', 'm4', 'm5']);
    assert.equal(new Set(seen).size, 5);
  });

  it('does not fail a placed order when notification delivery is unavailable', async () => {
    pushShouldFail = true;
    try {
      const buyer = await registerUser('p10g-outage-buyer', 'buyer');
      const farmer = await registerUser('p10g-outage-farmer', 'farmer');
      const orderIds = await checkout(buyer, farmer);
      assert.equal(orderIds.length, 1);
      const records = await notificationsFor(farmer.uid);
      assert.equal(records.length, 1);
      assert.equal(records[0]!.type, 'order_placed');
    } finally {
      pushShouldFail = false;
    }
  });
});
