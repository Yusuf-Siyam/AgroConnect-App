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
import {
  connectStorageEmulator,
  getStorage,
  ref,
  uploadString,
  type FirebaseStorage,
} from 'firebase/storage';

import { AiProviderError, AiProviderTimeoutError } from '../src/providers/aiErrors';
import type {
  AiTextProvider,
  AiTextRequest,
  CropDiseaseClassifier,
  CropDiseaseInput,
  CropDiseaseResult,
} from '../src/types/ai';
import type { FirebaseAdminServices } from '../src/config/firebase';

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
  storageBucket: STORAGE_BUCKET,
  appId: '1:000000000000:web:emulator-phase09b',
};

type TestUser = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  storage: FirebaseStorage;
  uid: string;
  token: string;
};

let server: NetServer;
let baseUrl: string;
let admin: FirebaseAdminServices;
let activeClassifier: CropDiseaseClassifier;
let activeTextProvider: AiTextProvider;
const clientApps: FirebaseApp[] = [];
const guidanceCalls: AiTextRequest[] = [];

async function registerUser(label: string): Promise<TestUser> {
  const app = initializeApp(firebaseConfig, `${label}-${randomUUID()}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);
  const storage = getStorage(app, `gs://${STORAGE_BUCKET}`);
  connectStorageEmulator(storage, STORAGE_HOST, STORAGE_PORT);

  const email = `${label}-${randomUUID()}@example.com`;
  const credential = await createUserWithEmailAndPassword(auth, email, 'phase9-password-123');
  const uid = credential.user.uid;
  const timestamp = new Date().toISOString();
  await setDoc(doc(firestore, 'users', uid), {
    uid,
    email,
    displayName: label,
    role: 'farmer',
    isVerified: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return { app, auth, firestore, storage, uid, token: await credential.user.getIdToken(true) };
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
    const code = (error as { code?: string })?.code;
    return code === 'permission-denied' || code === 'storage/unauthorized';
  });
}

function imagePath(user: TestUser, diagnosisId = randomUUID()): string {
  return `cropDiagnoses/${user.uid}/${diagnosisId}/photo.jpg`;
}

async function uploadValidImage(user: TestUser, path: string): Promise<void> {
  await uploadString(ref(user.storage, path), 'fake-jpeg-bytes', 'raw', {
    contentType: 'image/jpeg',
  });
}

async function writeAdminImage(path: string, contentType: string, bytes: Buffer): Promise<void> {
  await admin.storage.bucket().file(path).save(bytes, { contentType });
}

function diagnose(user: TestUser, path: string, extra: Record<string, unknown> = {}): Promise<Response> {
  return fetchAs('/api/ai/diagnose', user.token, {
    method: 'POST',
    body: JSON.stringify({ imagePath: path, ...extra }),
  });
}

function classifierResult(label: string, confidence: number): CropDiseaseResult {
  return { label, confidence, alternatives: ['Other issue'] };
}

function resetEnv(): void {
  process.env.DISEASE_MODEL_ENDPOINT = 'https://classifier.example.test/diagnose';
  process.env.DISEASE_MODEL_API_KEY = 'test-classifier-key';
  process.env.GEMINI_API_KEY = '';
  process.env.GEMINI_MODEL = '';
  process.env.AI_DAILY_DIAGNOSIS_LIMIT = '3';
  process.env.AI_DIAGNOSES_PER_MINUTE = '100';
}

before(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = `${STORAGE_HOST}:${STORAGE_PORT}`;
  resetEnv();

  const { createApp } = await import('../src/app.js');
  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
  admin = getFirebaseAdmin();

  activeClassifier = {
    async classify(_input: CropDiseaseInput): Promise<CropDiseaseResult> {
      return classifierResult('Leaf spot', 0.9);
    },
  };
  activeTextProvider = {
    async generateText(request: AiTextRequest): Promise<string> {
      guidanceCalls.push(request);
      return 'Advisory tips only.';
    },
  };

  server = createApp({
    aiTextProvider: {
      generateText: (request) => activeTextProvider.generateText(request),
    },
    cropDiseaseClassifier: {
      classify: (input) => activeClassifier.classify(input),
    },
  }).listen(0);
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
  resetEnv();
});

describe('Phase 09B disease detection emulator verification', () => {
  it('restricts diagnosis endpoints to farmers', async () => {
    const farmer = await registerUser('p9b-role-farmer');
    const path = imagePath(farmer);
    await uploadValidImage(farmer, path);

    const missing = await fetchAs('/api/ai/diagnoses');
    assert.equal(missing.status, 401);

    const created = await diagnose(farmer, path);
    assert.equal(created.status, 201, await created.clone().text());
    const list = await fetchAs('/api/ai/diagnoses', farmer.token);
    assert.equal(list.status, 200);
    const detail = await fetchAs(`/api/ai/diagnoses/${path.split('/')[2]}`, farmer.token);
    assert.equal(detail.status, 200);
  });

  it('rejects wrong file type, oversized images and paths owned by another user', async () => {
    const owner = await registerUser('p9b-validation-owner');
    const other = await registerUser('p9b-validation-other');

    await expectPermissionDenied(
      uploadString(ref(other.storage, imagePath(owner)), 'wrong owner', 'raw', {
        contentType: 'image/jpeg',
      }),
    );
    await expectPermissionDenied(
      uploadString(ref(owner.storage, imagePath(owner)), 'text', 'raw', {
        contentType: 'text/plain',
      }),
    );

    const wrongTypePath = imagePath(owner);
    await writeAdminImage(wrongTypePath, 'text/plain', Buffer.from('not an image'));
    const wrongType = await diagnose(owner, wrongTypePath);
    assert.equal(wrongType.status, 400);
    assert.equal(await errorCode(wrongType), 'INVALID_IMAGE_TYPE');

    const largePath = imagePath(owner);
    await writeAdminImage(largePath, 'image/jpeg', Buffer.alloc(5 * 1024 * 1024 + 1, 1));
    const large = await diagnose(owner, largePath);
    assert.equal(large.status, 400);
    assert.equal(await errorCode(large), 'IMAGE_TOO_LARGE');

    const foreignPath = imagePath(other);
    await uploadValidImage(other, foreignPath);
    const foreign = await diagnose(owner, foreignPath);
    assert.equal(foreign.status, 400);
    assert.equal(await errorCode(foreign), 'INVALID_IMAGE_PATH');
  });

  it('maps every confidence band and hides the label when uncertain', async () => {
    const user = await registerUser('p9b-bands');
    const bands = [
      { confidence: 0.2, status: 'uncertain', label: 'Secret disease name' },
      { confidence: 0.6, status: 'possible', label: 'Possible blight' },
      { confidence: 0.95, status: 'likely', label: 'Confirmed rust' },
    ];

    for (const band of bands) {
      activeClassifier = {
        async classify(): Promise<CropDiseaseResult> {
          return classifierResult(band.label, band.confidence);
        },
      };
      const path = imagePath(user);
      await uploadValidImage(user, path);
      const response = await diagnose(user, path, { cropName: 'Tomato', language: 'en' });
      assert.equal(response.status, 201, await response.clone().text());
      const body = await response.json();
      assert.equal(body.status, band.status);
      assert.equal(body.confidence, band.confidence);
      assert.equal(body.advisoryNotice, 'This is advisory, not a guaranteed diagnosis.');
      if (band.status === 'uncertain') {
        assert.doesNotMatch(body.result.label, /secret/i);
        assert.match(body.result.label, /clearer photo/i);
        assert.deepEqual(body.result.alternatives, []);
      } else {
        assert.equal(body.result.label, band.label);
      }
    }
  });

  it('enforces a separate daily diagnosis limit', async () => {
    const user = await registerUser('p9b-diagnosis-limit');
    activeClassifier = {
      async classify(): Promise<CropDiseaseResult> {
        return classifierResult('Blight', 0.9);
      },
    };

    for (let index = 0; index < 3; index += 1) {
      const path = imagePath(user);
      await uploadValidImage(user, path);
      assert.equal((await diagnose(user, path)).status, 201);
    }
    const limitedPath = imagePath(user);
    await uploadValidImage(user, limitedPath);
    const limited = await diagnose(user, limitedPath);
    assert.equal(limited.status, 429);
    assert.equal(await errorCode(limited), 'AI_DAILY_DIAGNOSIS_LIMIT_REACHED');
  });

  it('returns classifier only when Gemini is not configured, and adds guidance when it is', async () => {
    const user = await registerUser('p9b-guidance');
    activeClassifier = {
      async classify(): Promise<CropDiseaseResult> {
        return classifierResult('Blight', 0.8);
      },
    };
    guidanceCalls.length = 0;

    const withoutGeminiPath = imagePath(user);
    await uploadValidImage(user, withoutGeminiPath);
    const withoutGemini = await (
      await diagnose(user, withoutGeminiPath, { cropName: 'Potato', language: 'en' })
    ).json();
    assert.equal(withoutGemini.guidance, undefined);
    assert.equal(guidanceCalls.length, 0);

    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GEMINI_MODEL = 'test-model';
    try {
      const withGeminiPath = imagePath(user);
      await uploadValidImage(user, withGeminiPath);
      const withGemini = await (
        await diagnose(user, withGeminiPath, { cropName: 'Potato', language: 'en' })
      ).json();
      assert.equal(withGemini.guidance, 'Advisory tips only.');
      assert.equal(guidanceCalls.length, 1);
      assert.match(guidanceCalls[0]!.systemInstruction, /never claim a guaranteed diagnosis/i);
      assert.match(guidanceCalls[0]!.systemInstruction, /follow the label/i);
    } finally {
      process.env.GEMINI_API_KEY = '';
      process.env.GEMINI_MODEL = '';
    }
  });

  it('returns a clear not-configured error without a classifier', async () => {
    const user = await registerUser('p9b-not-configured');
    const path = imagePath(user);
    await uploadValidImage(user, path);
    const endpoint = process.env.DISEASE_MODEL_ENDPOINT;
    const key = process.env.DISEASE_MODEL_API_KEY;
    process.env.DISEASE_MODEL_ENDPOINT = '';
    process.env.DISEASE_MODEL_API_KEY = '';

    try {
      const response = await diagnose(user, path);
      assert.equal(response.status, 503, await response.clone().text());
      const body = await response.json();
      assert.equal(body.error.code, 'AI_NOT_CONFIGURED');
      assert.match(String(body.error.message), /not configured/i);
    } finally {
      process.env.DISEASE_MODEL_ENDPOINT = endpoint;
      process.env.DISEASE_MODEL_API_KEY = key;
    }
  });

  it('handles classifier timeout and error without inventing results', async () => {
    const user = await registerUser('p9b-provider-errors');

    activeClassifier = {
      async classify(): Promise<CropDiseaseResult> {
        throw new AiProviderTimeoutError('The disease classifier');
      },
    };
    const timeoutPath = imagePath(user);
    await uploadValidImage(user, timeoutPath);
    const timeout = await diagnose(user, timeoutPath);
    assert.equal(timeout.status, 502);
    assert.equal(await errorCode(timeout), 'AI_PROVIDER_TIMEOUT');

    activeClassifier = {
      async classify(): Promise<CropDiseaseResult> {
        throw new AiProviderError('Upstream failed');
      },
    };
    const errorPath = imagePath(user);
    await uploadValidImage(user, errorPath);
    const failed = await diagnose(user, errorPath);
    assert.equal(failed.status, 502);
    assert.equal(await errorCode(failed), 'AI_PROVIDER_ERROR');

    assert.equal((await fetchAs('/api/ai/diagnoses', user.token)).status, 200);
    const list = await (await fetchAs('/api/ai/diagnoses', user.token)).json();
    assert.equal(list.total, 0);
  });

  it('enforces owner-only reads/deletes, rules, and removes the image on delete', async () => {
    const owner = await registerUser('p9b-rules-owner');
    const other = await registerUser('p9b-rules-other');
    activeClassifier = {
      async classify(): Promise<CropDiseaseResult> {
        return classifierResult('Rust', 0.9);
      },
    };
    const path = imagePath(owner);
    const diagnosisId = path.split('/')[2]!;
    await uploadValidImage(owner, path);

    const created = await diagnose(owner, path);
    assert.equal(created.status, 201, await created.clone().text());

    assert.equal((await fetchAs(`/api/ai/diagnoses/${diagnosisId}`, other.token)).status, 404);
    assert.equal(
      (await fetchAs(`/api/ai/diagnoses/${diagnosisId}`, other.token, { method: 'DELETE' })).status,
      404,
    );
    await expectPermissionDenied(getDoc(doc(other.firestore, 'cropDiagnoses', diagnosisId)));
    await expectPermissionDenied(
      setDoc(doc(other.firestore, 'cropDiagnoses', randomUUID()), {
        userId: other.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );

    assert.equal((await getDoc(doc(owner.firestore, 'cropDiagnoses', diagnosisId))).exists(), true);
    const deleted = await fetchAs(`/api/ai/diagnoses/${diagnosisId}`, owner.token, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
    assert.equal((await admin.storage.bucket().file(path).exists())[0], false);
    assert.equal(
      (await admin.firestore.collection('cropDiagnoses').doc(diagnosisId).get()).exists,
      false,
    );
  });
});
