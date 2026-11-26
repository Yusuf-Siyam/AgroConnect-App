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

import { AiProviderError, AiProviderTimeoutError } from '../src/providers/aiErrors';
import type { AiTextProvider, AiTextRequest } from '../src/types/ai';
import type { FirebaseAdminServices } from '../src/config/firebase';

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

const firebaseConfig = {
  apiKey: 'emulator-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: '1:000000000000:web:emulator-phase09a',
};

type Role = 'farmer' | 'buyer';
type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };

let server: NetServer;
let baseUrl: string;
let admin: FirebaseAdminServices;
let activeProvider: AiTextProvider;
const clientApps: FirebaseApp[] = [];
const providerCalls: AiTextRequest[] = [];

async function registerUser(label: string, role: Role): Promise<TestUser> {
  const app = initializeApp(firebaseConfig, `${label}-${randomUUID()}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);

  const email = `${label}-${randomUUID()}@example.com`;
  const credential = await createUserWithEmailAndPassword(auth, email, 'phase9-password-123');
  const uid = credential.user.uid;
  const timestamp = new Date().toISOString();
  await setDoc(doc(firestore, 'users', uid), {
    uid,
    email,
    displayName: label,
    role,
    isVerified: false,
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

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

async function expectPermissionDenied(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied');
  });
}

function echoProvider(): AiTextProvider {
  return {
    async generateText(request: AiTextRequest): Promise<string> {
      providerCalls.push(request);
      return `Advisory reply in ${request.language}.`;
    },
  };
}

async function chat(
  user: TestUser,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchAs('/api/ai/chat', user.token, { method: 'POST', body: JSON.stringify(body) });
}

before(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
  process.env.GEMINI_API_KEY = '';
  process.env.GEMINI_MODEL = '';
  process.env.AI_DAILY_MESSAGE_LIMIT = '5';
  process.env.AI_MESSAGES_PER_MINUTE = '100';

  const { createApp } = await import('../src/app.js');
  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
  const { createGeminiTextProvider } = await import('../src/providers/gemini.js');
  admin = getFirebaseAdmin();

  activeProvider = echoProvider();
  const proxyProvider: AiTextProvider = {
    generateText: (request) => activeProvider.generateText(request),
  };
  server = createApp({ aiTextProvider: proxyProvider }).listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  geminiProvider = createGeminiTextProvider();
});

let geminiProvider: AiTextProvider;

after(async () => {
  for (const app of clientApps.splice(0)) await deleteApp(app);
  if (admin) await deleteAdminApp(admin.app);
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

describe('Phase 09A farming assistant emulator verification', () => {
  it('restricts assistant endpoints to farmers and validates input', async () => {
    const farmer = await registerUser('p9a-farmer-role', 'farmer');
    const buyer = await registerUser('p9a-buyer-role', 'buyer');
    activeProvider = echoProvider();

    assert.equal((await chat(buyer, { message: ' কীভাবে সার দেব?' })).status, 403);
    assert.equal((await fetchAs('/api/ai/conversations', buyer.token)).status, 403);
    assert.equal((await fetchAs('/api/ai/conversations')).status, 401);
    assert.equal((await chat(farmer, { message: 'x'.repeat(2_001) })).status, 400);
    assert.equal((await chat(farmer, { message: 'Help', language: 'fr' })).status, 400);

    const response = await chat(farmer, { message: 'আমার ধানের রোগ কী?' });
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(body.reply.role, 'assistant');
    assert.equal(body.language, 'bn');
  });

  it('saves conversations, lists them, and enforces owner-only reads and deletes', async () => {
    const owner = await registerUser('p9a-owner', 'farmer');
    const other = await registerUser('p9a-other', 'farmer');
    activeProvider = echoProvider();

    const first = await (await chat(owner, { message: 'First question', language: 'en' })).json();
    const second = await (
      await chat(owner, {
        message: 'দ্বিতীয় প্রশ্ন',
        conversationId: first.conversation.id,
      })
    ).json();
    assert.equal(second.conversation.id, first.conversation.id);
    assert.equal(second.conversation.messages.length, 4);

    assert.equal((await fetchAs(`/api/ai/conversations/${first.conversation.id}`, other.token)).status, 404);
    assert.equal(
      (await fetchAs(`/api/ai/conversations/${first.conversation.id}`, other.token, { method: 'DELETE' })).status,
      404,
    );

    const own = await fetchAs(`/api/ai/conversations/${first.conversation.id}`, owner.token);
    assert.equal(own.status, 200);
    assert.equal(((await own.json()) as { messages: unknown[] }).messages.length, 4);

    const list = await (await fetchAs('/api/ai/conversations?limit=1&offset=0', owner.token)).json();
    assert.equal(list.total, 1);
    assert.equal(list.limit, 1);
    assert.equal(list.items.length, 1);

    const deleted = await fetchAs(`/api/ai/conversations/${first.conversation.id}`, owner.token, {
      method: 'DELETE',
    });
    assert.equal(deleted.status, 204);
    assert.equal((await fetchAs(`/api/ai/conversations/${first.conversation.id}`, owner.token)).status, 404);
  });

  it('enforces the per-user daily message limit', async () => {
    const user = await registerUser('p9a-limit', 'farmer');
    activeProvider = echoProvider();

    for (const message of ['One', 'Two', 'Three', 'Four', 'Five']) {
      assert.equal((await chat(user, { message, language: 'en' })).status, 200);
    }
    const limited = await chat(user, { message: 'Six', language: 'en' });
    assert.equal(limited.status, 429);
    assert.equal(await errorCode(limited), 'AI_DAILY_MESSAGE_LIMIT_REACHED');
  });

  it('returns a clear AI-not-configured error when the key or model is missing', async () => {
    const user = await registerUser('p9a-not-configured', 'farmer');
    activeProvider = geminiProvider;

    const response = await chat(user, { message: 'What fertilizer should I use?', language: 'en' });
    assert.equal(response.status, 503, await response.clone().text());
    const body = await response.json();
    assert.equal(body.error.code, 'AI_NOT_CONFIGURED');
    assert.match(String(body.error.message), /not configured/i);

    activeProvider = echoProvider();
  });

  it('handles provider timeout and provider error without crashing', async () => {
    const user = await registerUser('p9a-provider-errors', 'farmer');

    activeProvider = {
      async generateText(): Promise<string> {
        throw new AiProviderTimeoutError('The Gemini assistant');
      },
    };
    const timeout = await chat(user, { message: 'Water schedule?', language: 'en' });
    assert.equal(timeout.status, 504);
    assert.equal(await errorCode(timeout), 'AI_PROVIDER_TIMEOUT');

    activeProvider = {
      async generateText(): Promise<string> {
        throw new AiProviderError('Upstream failed');
      },
    };
    const failed = await chat(user, { message: 'Fertilizer?', language: 'en' });
    assert.equal(failed.status, 502);
    assert.equal(await errorCode(failed), 'AI_PROVIDER_ERROR');

    activeProvider = echoProvider();
    const recovered = await chat(user, { message: 'Irrigation?', language: 'en' });
    assert.equal(recovered.status, 200);
  });

  it('handles Bangla and English with advisory system rules and bounded history', async () => {
    const user = await registerUser('p9a-language', 'farmer');
    providerCalls.length = 0;
    activeProvider = echoProvider();

    const bangla = await (await chat(user, { message: 'আমার টমেটোের পাতা হলুদ।' })).json();
    assert.equal(bangla.language, 'bn');
    const english = await (
      await chat(user, {
        message: 'My tomato leaves are yellow. What should I do?',
        language: 'en',
        conversationId: bangla.conversation.id,
      })
    ).json();
    assert.equal(english.language, 'en');

    assert.equal(providerCalls.length, 2);
    assert.equal(providerCalls[0]!.language, 'bn');
    assert.equal(providerCalls[1]!.language, 'en');
    for (const call of providerCalls) {
      assert.match(call.systemInstruction, /never claim a guaranteed diagnosis/i);
      assert.match(call.systemInstruction, /product label/i);
      assert.match(call.systemInstruction, /agricultural extension officer/i);
      assert.match(call.systemInstruction, /only farming topics/i);
    }
    assert.match(providerCalls[0]!.systemInstruction, /Bangla/i);
    assert.match(providerCalls[1]!.systemInstruction, /English/i);
    assert.ok(providerCalls[1]!.messages.length <= 8);
    assert.equal(providerCalls[1]!.messages.at(-1)?.role, 'user');
  });

  it('blocks direct Firestore writes and cross-user reads for AI records', async () => {
    const owner = await registerUser('p9a-rules-owner', 'farmer');
    const other = await registerUser('p9a-rules-other', 'farmer');
    activeProvider = echoProvider();

    const created = await (await chat(owner, { message: 'Rule check', language: 'en' })).json();
    const conversationId = String(created.conversation.id);

    await expectPermissionDenied(
      getDoc(doc(other.firestore, 'farmingConversations', conversationId)),
    );
    await expectPermissionDenied(
      setDoc(doc(other.firestore, 'farmingConversations', randomUUID()), {
        userId: other.uid,
        messages: [],
        language: 'en',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );
    await expectPermissionDenied(
      setDoc(doc(other.firestore, 'aiUsage', other.uid), { messageCount: 99 }),
    );
    assert.equal((await getDoc(doc(owner.firestore, 'farmingConversations', conversationId))).exists(), true);
  });
});
