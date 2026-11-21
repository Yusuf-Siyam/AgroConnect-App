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

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

const firebaseConfig = {
  apiKey: 'emulator-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: '1:000000000000:web:emulator-phase10a',
};

type Role = 'farmer' | 'buyer' | 'transporter' | 'admin';
type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };

let server: NetServer;
let baseUrl: string;
let adminServices: FirebaseAdminServices;
const clientApps: FirebaseApp[] = [];

async function registerUser(label: string, role: Role): Promise<TestUser> {
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
  await assert.rejects(promise, (error: unknown) => {
    return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied');
  });
}

async function createConversation(
  user: TestUser,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchAs('/api/chat/conversations', user.token, { method: 'POST', body: JSON.stringify(body) });
}

async function sendMessage(user: TestUser, chatId: string, text: string): Promise<Response> {
  return fetchAs(`/api/chat/conversations/${chatId}/messages`, user.token, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

async function createPaidOrderWithJob(buyerId: string, farmerId: string, transporterId: string) {
  const orderId = `p10a-order-${randomUUID()}`;
  const timestamp = new Date().toISOString();
  await adminServices.firestore.collection('orders').doc(orderId).set({
    id: orderId,
    buyerId,
    sellerIds: [farmerId],
    status: 'paid',
    items: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await adminServices.firestore.collection('deliveryJobs').doc(randomUUID()).set({
    orderId,
    buyerId,
    farmerId,
    transporterId,
    orderStatus: 'paid',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return orderId;
}

before(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
  process.env.CHAT_MESSAGES_PER_MINUTE = '6';
  process.env.CHAT_CONVERSATIONS_PER_DAY = '2';
  process.env.CHAT_SUPPORT_MESSAGES_PER_HOUR = '2';

  const { createApp } = await import('../src/app.js');
  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
  adminServices = getFirebaseAdmin();
  server = createApp().listen(0);
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

describe('Phase 10A communication emulator verification', () => {
  it('restricts chat creation and validates text-only messages', async () => {
    const buyer = await registerUser('p10a-buyer-role', 'buyer');
    const farmer = await registerUser('p10a-farmer-role', 'farmer');
    const transporter = await registerUser('p10a-transporter-role', 'transporter');
    const admin = await registerUser('p10a-admin-role', 'admin');

    assert.equal((await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid })).status, 201);
    assert.equal((await createConversation(transporter, { type: 'buyer_farmer', farmerId: farmer.uid })).status, 403);
    assert.equal((await createConversation(admin, { type: 'buyer_farmer', farmerId: farmer.uid })).status, 403);
    assert.equal((await createConversation(buyer, { type: 'support' })).status, 201);
    assert.equal((await createConversation(buyer, { type: 'buyer_farmer' })).status, 400);
    assert.equal((await createConversation(buyer, { type: 'unsupported' })).status, 400);
    assert.equal((await fetchAs('/api/chat/conversations')).status, 401);

    const chatId = `bf_${buyer.uid}_${farmer.uid}`;
    assert.equal((await sendMessage(buyer, chatId, '   ')).status, 400);
    assert.equal((await sendMessage(buyer, chatId, 'x'.repeat(1_001))).status, 400);
    assert.equal((await sendMessage(buyer, chatId, '  Hello farmer  ')).status, 201);

    const stored = await getDoc(doc(buyer.firestore, 'chats', chatId));
    const data = stored.data()!;
    assert.deepEqual(data.participants, [buyer.uid, farmer.uid]);
    assert.deepEqual(Object.keys(data.participantInfo[buyer.uid]), ['displayName', 'role']);
    assert.equal(data.participantInfo[buyer.uid].role, 'buyer');
    assert.ok(!JSON.stringify(data).includes(buyer.uid + '@example.com'));
    assert.ok(!JSON.stringify(data).includes('phoneNumber'));
  });

  it('uses deterministic IDs and authorizes buyer-transporter chats from orders and jobs', async () => {
    const buyer = await registerUser('p10a-order-buyer', 'buyer');
    const farmer = await registerUser('p10a-order-farmer', 'farmer');
    const transporter = await registerUser('p10a-order-transporter', 'transporter');
    const stranger = await registerUser('p10a-order-stranger', 'buyer');
    const orderId = await createPaidOrderWithJob(buyer.uid, farmer.uid, transporter.uid);

    const created = await createConversation(buyer, { type: 'buyer_transporter', orderId });
    assert.equal(created.status, 201, await created.clone().text());
    assert.equal(((await created.json()) as { id: string }).id, `bt_${orderId}`);

    const transporterChat = await getChat(transporter, `bt_${orderId}`);
    assert.equal(transporterChat.status, 200);
    const transporterBody = (await transporterChat.json()) as { participants: string[]; orderId: string };
    assert.deepEqual(transporterBody.participants, [buyer.uid, transporter.uid]);
    assert.equal(transporterBody.orderId, orderId);

    assert.equal((await createConversation(stranger, { type: 'buyer_transporter', orderId })).status, 403);
    assert.equal((await createConversation(farmer, { type: 'buyer_transporter', orderId })).status, 403);
    assert.equal((await getChat(stranger, `bt_${orderId}`)).status, 404);
  });

  it('allows support replies by admins and blocks admin access to non-support chats', async () => {
    const user = await registerUser('p10a-support-user', 'buyer');
    const other = await registerUser('p10a-support-other', 'buyer');
    const admin = await registerUser('p10a-support-admin', 'admin');
    const farmer = await registerUser('p10a-support-farmer', 'farmer');

    const support = await createConversation(user, { type: 'support' });
    assert.equal(support.status, 201);
    const supportId = `support_${user.uid}`;
    assert.equal(((await support.json()) as { id: string }).id, supportId);

    assert.equal((await getChat(other, supportId)).status, 404);
    assert.equal((await getChat(admin, supportId)).status, 200);
    const reply = await sendMessage(admin, supportId, 'We will help with your order.');
    assert.equal(reply.status, 201);
    const message = (await reply.json()) as { senderId: string; text: string };
    assert.equal(message.senderId, 'support');
    assert.equal(message.text, 'We will help with your order.');

    const normal = await createConversation(user, { type: 'buyer_farmer', farmerId: farmer.uid });
    assert.equal(normal.status, 201);
    const normalId = `bf_${user.uid}_${farmer.uid}`;
    assert.equal((await getChat(admin, normalId)).status, 404);
    assert.equal((await sendMessage(admin, normalId, 'Admin reply')).status, 404);
  });

  it('enforces per-user message, new-conversation and support-hour limits', async () => {
    const user = await registerUser('p10a-limits-user', 'buyer');
    const farmers = await Promise.all([
      registerUser('p10a-limits-farmer-1', 'farmer'),
      registerUser('p10a-limits-farmer-2', 'farmer'),
      registerUser('p10a-limits-farmer-3', 'farmer'),
    ]);

    for (const farmer of farmers.slice(0, 2)) {
      const response = await createConversation(user, { type: 'buyer_farmer', farmerId: farmer.uid });
      assert.equal(response.status, 201, await response.clone().text());
    }
    const third = await createConversation(user, { type: 'buyer_farmer', farmerId: farmers[2]!.uid });
    assert.equal(third.status, 429);
    assert.equal(await errorCode(third), 'CHAT_CONVERSATION_LIMIT_REACHED');

    const firstChat = `bf_${user.uid}_${farmers[0]!.uid}`;
    for (let index = 0; index < 6; index += 1) {
      const response = await sendMessage(user, firstChat, `Message ${index}`);
      assert.equal(response.status, 201, await response.clone().text());
    }
    const limited = await sendMessage(user, firstChat, 'One message too many');
    assert.equal(limited.status, 429);
    assert.equal(await errorCode(limited), 'CHAT_MESSAGE_RATE_LIMITED');

    const supportUser = await registerUser('p10a-support-limit', 'buyer');
    assert.equal((await createConversation(supportUser, { type: 'support' })).status, 201);
    const supportId = `support_${supportUser.uid}`;
    for (const text of ['Need help', 'More detail']) {
      assert.equal((await sendMessage(supportUser, supportId, text)).status, 201);
    }
    const supportLimited = await sendMessage(supportUser, supportId, 'Third message');
    assert.equal(supportLimited.status, 429);
    assert.equal(await errorCode(supportLimited), 'CHAT_SUPPORT_RATE_LIMITED');
  });

  it('tracks unread counts and allows a participant to mark a chat read through the backend', async () => {
    const buyer = await registerUser('p10a-unread-buyer', 'buyer');
    const farmer = await registerUser('p10a-unread-farmer', 'farmer');
    const chatId = `bf_${buyer.uid}_${farmer.uid}`;
    assert.equal((await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid })).status, 201);
    assert.equal((await sendMessage(buyer, chatId, 'Please confirm the order.')).status, 201);

    const beforeRead = await getChat(farmer, chatId);
    assert.equal(beforeRead.status, 200);
    assert.equal(((await beforeRead.json()) as { unreadCounts: Record<string, number> }).unreadCounts[farmer.uid], 1);

    const marked = await fetchAs(`/api/chat/conversations/${chatId}/read`, farmer.token, { method: 'POST' });
    assert.equal(marked.status, 204);
    const afterRead = await getChat(farmer, chatId);
    assert.equal(((await afterRead.json()) as { unreadCounts: Record<string, number> }).unreadCounts[farmer.uid], 0);
  });

  it('denies client writes, cross-user reads and admin reads of non-support chats in Firestore rules', async () => {
    const buyer = await registerUser('p10a-rules-buyer', 'buyer');
    const farmer = await registerUser('p10a-rules-farmer', 'farmer');
    const stranger = await registerUser('p10a-rules-stranger', 'buyer');
    const admin = await registerUser('p10a-rules-admin', 'admin');
    const chatId = `bf_${buyer.uid}_${farmer.uid}`;
    assert.equal((await createConversation(buyer, { type: 'buyer_farmer', farmerId: farmer.uid })).status, 201);
    assert.equal((await createConversation(buyer, { type: 'support' })).status, 201);

    assert.equal((await getDoc(doc(buyer.firestore, 'chats', chatId))).exists(), true);
    await expectPermissionDenied(getDoc(doc(stranger.firestore, 'chats', chatId)));
    await expectPermissionDenied(
      setDoc(doc(stranger.firestore, 'chats', `bf_${stranger.uid}_${farmer.uid}`), {
        type: 'buyer_farmer',
        participants: [stranger.uid, farmer.uid],
      }),
    );
    await expectPermissionDenied(
      setDoc(doc(buyer.firestore, 'chats', chatId, 'messages', randomUUID()), {
        chatId,
        senderId: buyer.uid,
        text: 'Client write',
        createdAt: new Date().toISOString(),
      }),
    );
    await expectPermissionDenied(
      setDoc(doc(buyer.firestore, 'chatUsage', buyer.uid), { minuteCount: 999 }),
    );
    await expectPermissionDenied(getDoc(doc(admin.firestore, 'chats', chatId)));
    assert.equal((await getDoc(doc(admin.firestore, 'chats', `support_${buyer.uid}`))).exists(), true);
  });
});

async function getChat(user: TestUser, chatId: string): Promise<Response> {
  return fetchAs(`/api/chat/conversations/${chatId}`, user.token);
}
