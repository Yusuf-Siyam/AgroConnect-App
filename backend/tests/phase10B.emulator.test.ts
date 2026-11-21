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
  getDoc,
  getFirestore,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

import type { FirebaseAdminServices } from '../src/config/firebase';
import type { PushProvider } from '../src/types/notification';

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

const firebaseConfig = {
  apiKey: 'emulator-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: '1:000000000000:web:emulator-phase10b',
};

type Role = 'farmer' | 'buyer' | 'transporter' | 'admin';
type Locale = 'bn' | 'en';
type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };

type PushCall = {
  userId: string;
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
};

let server: NetServer;
let baseUrl: string;
let adminServices: FirebaseAdminServices;
let pushCalls: PushCall[] = [];
let pushShouldFail = false;

const pushProvider: PushProvider = {
  async send(userId, tokens, message) {
    pushCalls.push({
      userId,
      tokens,
      title: message.title,
      body: message.body,
      data: message.data,
    });
    if (pushShouldFail) throw new Error('Test FCM outage');
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
    await adminServices.auth.setCustomUserClaims(uid, { admin: true, role: 'admin' });
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

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

async function expectPermissionDenied(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(
    promise,
    (error: unknown) =>
      Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied'),
  );
}

async function createConversation(user: TestUser, body: Record<string, unknown>): Promise<Response> {
  return fetchAs('/api/chat/conversations', user.token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function sendMessage(user: TestUser, chatId: string, text: string): Promise<Response> {
  return fetchAs(`/api/chat/conversations/${chatId}/messages`, user.token, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

async function registerDevice(user: TestUser, token: string, platform: 'ios' | 'android' | 'web'): Promise<Response> {
  return fetchAs('/api/notifications/devices', user.token, {
    method: 'POST',
    body: JSON.stringify({ token, platform }),
  });
}

async function notificationsFor(userId: string) {
  const snapshot = await adminServices.firestore
    .collection('notifications')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
}

before(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;

  const { createApp } = await import('../src/app.js');
  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
  adminServices = getFirebaseAdmin();
  server = createApp({ pushProvider }).listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
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

describe('Phase 10B notification emulator verification', () => {
  it('stores in-app notifications as type + params without message content', async () => {
    pushCalls = [];
    pushShouldFail = false;
    const buyer = await registerUser('p10b-inapp-buyer', 'buyer');
    const farmer = await registerUser('p10b-inapp-farmer', 'farmer');
    await registerDevice(farmer, 'fcm-inapp-token', 'android');

    const chatId = `bf_${buyer.uid}_${farmer.uid}`;
    assert.equal((await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid })).status, 201);
    const message = 'Private harvest price is 250 taka';
    assert.equal((await sendMessage(buyer, chatId, message)).status, 201);

    const records = await notificationsFor(farmer.uid);
    assert.equal(records.length, 1);
    const record = records[0]!;
    assert.equal(record.type, 'chat_message');
    assert.deepEqual(record.params, { chatId, senderName: 'p10b-inapp-buyer' });
    assert.equal(record.readAt, null);
    assert.deepEqual(record.target, { chatId, url: `/chat/${chatId}` });
    assert.ok(!JSON.stringify(record).includes(message));

    assert.equal(pushCalls.length, 1);
    assert.equal(pushCalls[0]!.userId, farmer.uid);
    assert.deepEqual(pushCalls[0]!.tokens, ['fcm-inapp-token']);
    assert.equal(pushCalls[0]!.data.chatId, chatId);
    assert.ok(!pushCalls[0]!.body.includes(message));
  });

  it('uses Bangla by default and English when preferredLanguage is en', async () => {
    pushCalls = [];
    const defaultBuyer = await registerUser('p10b-bn-buyer', 'buyer');
    const defaultFarmer = await registerUser('p10b-bn-farmer', 'farmer');
    await registerDevice(defaultFarmer, 'fcm-bn-token', 'android');
    const defaultChat = `bf_${defaultBuyer.uid}_${defaultFarmer.uid}`;
    assert.equal(
      (await createConversation(defaultBuyer, { type: 'buyer_farmer', farmerId: defaultFarmer.uid })).status,
      201,
    );
    assert.equal((await sendMessage(defaultBuyer, defaultChat, ' assalamu alaikum ')).status, 201);
    assert.ok(pushCalls[0]!.title.length > 0);
    assert.ok(/[\u0980-\u09FF]/.test(pushCalls[0]!.body));

    pushCalls = [];
    const englishBuyer = await registerUser('p10b-en-buyer', 'buyer');
    const englishFarmer = await registerUser('p10b-en-farmer', 'farmer', 'en');
    await registerDevice(englishFarmer, 'fcm-en-token', 'ios');
    const englishChat = `bf_${englishBuyer.uid}_${englishFarmer.uid}`;
    assert.equal(
      (await createConversation(englishBuyer, { type: 'buyer_farmer', farmerId: englishFarmer.uid })).status,
      201,
    );
    assert.equal((await sendMessage(englishBuyer, englishChat, 'Hello there')).status, 201);
    assert.equal(pushCalls[0]!.title, 'New message');
    assert.match(pushCalls[0]!.body, /sent you a message/);
  });

  it('does not let push failure or device-token failures break a message', async () => {
    pushCalls = [];
    pushShouldFail = true;
    const buyer = await registerUser('p10b-fail-buyer', 'buyer');
    const farmer = await registerUser('p10b-fail-farmer', 'farmer');
    await registerDevice(farmer, 'fcm-fail-token', 'web');
    const chatId = `bf_${buyer.uid}_${farmer.uid}`;
    assert.equal((await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid })).status, 201);

    const sent = await sendMessage(buyer, chatId, 'Message still succeeds');
    assert.equal(sent.status, 201, await sent.clone().text());
    assert.equal(((await sent.json()) as { text: string }).text, 'Message still succeeds');

    const records = await notificationsFor(farmer.uid);
    assert.equal(records.filter((record) => record.type === 'chat_message').length, 1);
    assert.ok(pushCalls.length >= 1);
    pushShouldFail = false;
  });

  it('registers hashed backend-only device tokens and supports rotation/removal', async () => {
    const user = await registerUser('p10b-device-user', 'buyer');
    const token = 'fcm-rotate-token';
    const expectedId = createHash('sha256').update(token).digest('hex');

    assert.equal((await registerDevice(user, token, 'android')).status, 204);
    const deviceRef = doc(user.firestore, 'users', user.uid, 'devices', expectedId);
    const stored = await adminServices.firestore
      .collection('users')
      .doc(user.uid)
      .collection('devices')
      .doc(expectedId)
      .get();
    assert.equal(stored.exists, true);
    assert.equal(stored.data()?.token, token);
    assert.equal(stored.data()?.platform, 'android');
    assert.notEqual(expectedId, token);

    await expectPermissionDenied(getDoc(deviceRef));
    await expectPermissionDenied(
      setDoc(doc(user.firestore, 'users', user.uid, 'devices', 'client-write'), {
        token: 'client-token',
        platform: 'android',
      }),
    );

    assert.equal((await registerDevice(user, token, 'ios')).status, 204);
    const rotated = await adminServices.firestore
      .collection('users')
      .doc(user.uid)
      .collection('devices')
      .doc(expectedId)
      .get();
    assert.equal(rotated.data()?.platform, 'ios');

    const removed = await fetchAs('/api/notifications/devices', user.token, {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    });
    assert.equal(removed.status, 204);
    assert.equal(
      (
        await adminServices.firestore
          .collection('users')
          .doc(user.uid)
          .collection('devices')
          .doc(expectedId)
          .get()
      ).exists,
      false,
    );
  });

  it('marks notifications read only through the backend and only for the owner', async () => {
    const buyer = await registerUser('p10b-read-buyer', 'buyer');
    const farmer = await registerUser('p10b-read-farmer', 'farmer');
    const stranger = await registerUser('p10b-read-stranger', 'buyer');
    const chatId = `bf_${buyer.uid}_${farmer.uid}`;
    assert.equal((await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid })).status, 201);
    assert.equal((await sendMessage(buyer, chatId, 'Please read this')).status, 201);

    const records = await notificationsFor(farmer.uid);
    const notificationId = records[0]!.id;
    assert.equal((await getDoc(doc(farmer.firestore, 'notifications', notificationId))).exists(), true);

    const denied = await fetchAs(`/api/notifications/${notificationId}/read`, stranger.token, {
      method: 'POST',
    });
    assert.equal(denied.status, 404);
    assert.equal(await errorCode(denied), 'NOTIFICATION_NOT_FOUND');

    await expectPermissionDenied(
      setDoc(doc(farmer.firestore, 'notifications', notificationId), {
        userId: farmer.uid,
        readAt: new Date().toISOString(),
      }),
    );

    const marked = await fetchAs(`/api/notifications/${notificationId}/read`, farmer.token, {
      method: 'POST',
    });
    assert.equal(marked.status, 204);
    const after = await adminServices.firestore.collection('notifications').doc(notificationId).get();
    assert.notEqual(after.data()?.readAt, null);
  });

  it('uses support_message and support_reply types for support threads', async () => {
    pushCalls = [];
    const user = await registerUser('p10b-support-user', 'buyer');
    const admin = await registerUser('p10b-support-admin', 'admin');
    await registerDevice(user, 'fcm-support-user-token', 'android');
    await registerDevice(admin, 'fcm-support-admin-token', 'android');

    assert.equal((await createConversation(user, { type: 'support' })).status, 201);
    const supportId = `support_${user.uid}`;
    assert.equal((await sendMessage(user, supportId, 'Need help with an order')).status, 201);

    const adminNotifications = await notificationsFor(admin.uid);
    assert.equal(adminNotifications.length, 1);
    assert.equal(adminNotifications[0]!.type, 'support_message');
    assert.equal(adminNotifications[0]!.params.senderName, 'p10b-support-user');

    const reply = await sendMessage(admin, supportId, 'We can help with that order');
    assert.equal(reply.status, 201, await reply.clone().text());

    const userNotifications = await notificationsFor(user.uid);
    assert.equal(userNotifications.length, 1);
    assert.equal(userNotifications[0]!.type, 'support_reply');
    assert.equal(userNotifications[0]!.params.senderName, 'AgroConnect Support');
    assert.ok(!JSON.stringify(userNotifications[0]).includes('We can help with that order'));

    assert.equal(pushCalls.length, 2);
    assert.equal(pushCalls[0]!.userId, admin.uid);
    assert.equal(pushCalls[1]!.userId, user.uid);
  });
});
