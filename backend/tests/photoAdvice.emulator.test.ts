import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server as NetServer } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getFirestore, setDoc, type Firestore } from 'firebase/firestore';

import { AiProviderError } from '../src/providers/aiErrors';
import type { PlantPhotoAdvice, PlantPhotoAdviceInput, PlantPhotoAdvisor } from '../src/types/ai';
import { env } from '../src/config/env.js';
import type { FirebaseAdminServices } from '../src/config/firebase.js';
import { createCloudinaryTestService } from '../src/services/cloudinary.testDouble.js';
import { resetCloudinaryService, setCloudinaryService } from '../src/services/cloudinary.js';

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;
const CLOUD_NAME = 'test-cloud';

const firebaseConfig = {
  apiKey: 'emulator-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  storageBucket: `${PROJECT_ID}.appspot.com`,
  appId: '1:000000000000:web:emulator-photo-advice',
};

type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };

let server: NetServer;
let baseUrl: string;
let admin: FirebaseAdminServices;
let activeAdvisor: PlantPhotoAdvisor;
let advisorCalls: PlantPhotoAdviceInput[];
const clientApps: FirebaseApp[] = [];
const cloudinaryState = { deleted: [] as any[], failDelete: false, cloudName: CLOUD_NAME };

async function registerUser(label: string): Promise<TestUser> {
  const app = initializeApp(firebaseConfig, `${label}-${randomUUID()}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);

  const email = `${label}-${randomUUID()}@example.com`;
  const credential = await createUserWithEmailAndPassword(auth, email, 'photo-advice-password-123');
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

function diagnosisImage(user: TestUser, diagnosisId = randomUUID()) {
  return {
    provider: 'cloudinary' as const,
    publicId: `agroconnect/diagnoses/${user.uid}/${diagnosisId}/photo`,
    resourceType: 'image' as const,
    deliveryType: 'authenticated' as const,
    version: 1,
    format: 'jpg',
  };
}

function diagnose(user: TestUser, image: unknown, extra: Record<string, unknown> = {}): Promise<Response> {
  return fetchAs('/api/ai/diagnose', user.token, {
    method: 'POST',
    body: JSON.stringify({ image, ...extra }),
  });
}

function advice(overrides: Partial<PlantPhotoAdvice> = {}): PlantPhotoAdvice {
  return {
    source: 'gemini_vision',
    observation: 'Leaf edges look dry',
    possibleCauses: ['Possible water stress'],
    careSteps: ['Check soil moisture', 'Improve drainage'],
    uncertainty: 'possible',
    verified: false,
    notice: 'Unverified AI photo suggestion - check with a local agriculture extension officer before acting.',
    ...overrides,
  };
}

before(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;
  process.env.DISEASE_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.GEMINI_VISION_MODEL = 'test-vision-model';
  process.env.AI_DAILY_DIAGNOSIS_LIMIT = '20';
  process.env.AI_DIAGNOSES_PER_MINUTE = '100';
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD_NAME;
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  (env as any).aiDiagnosisDailyLimit = 20;
  (env as any).aiDiagnosesPerMinute = 100;
  setCloudinaryService(createCloudinaryTestService(cloudinaryState));

  const { createApp } = await import('../src/app.js');
  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
  admin = getFirebaseAdmin();

  advisorCalls = [];
  activeAdvisor = {
    async suggest(input: PlantPhotoAdviceInput): Promise<PlantPhotoAdvice> {
      advisorCalls.push(input);
      return advice();
    },
  };

  server = createApp({
    plantPhotoAdvisor: {
      suggest: (input) => activeAdvisor.suggest(input),
    },
  }).listen(0);
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  resetCloudinaryService();
  for (const app of clientApps.splice(0)) await deleteApp(app);
  if (admin) await deleteAdminApp(admin.app);
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

describe('Unverified AI photo suggestion emulator verification', () => {
  it('returns a gemini_vision suggestion with no verified or certainty claim', async () => {
    const user = await registerUser('photo-gemini');
    const image = diagnosisImage(user);
    advisorCalls.length = 0;

    const response = await diagnose(user, image, { cropName: 'Tomato', language: 'en' });
    assert.equal(response.status, 201, await response.clone().text());
    const body = await response.json();

    assert.equal(body.source, 'gemini_vision');
    assert.equal(body.verified, false);
    assert.match(String(body.advisoryNotice), /unverified ai photo suggestion/i);
    assert.doesNotMatch(String(body.advisoryNotice), /confirmed/i);
    assert.match(String(body.result.label), /^Possible issue:/);
    assert.match(String(body.guidance), /unverified ai photo suggestion/i);
    assert.equal(advisorCalls.length, 1);
    assert.equal(advisorCalls[0]!.language, 'en');
    assert.equal(advisorCalls[0]!.cropName, 'Tomato');
    assert.equal(advisorCalls[0]!.mimeType, 'image/jpeg');

    const diagnosisId = image.publicId.split('/')[3]!;
    const stored = (await admin.firestore.collection('cropDiagnoses').doc(diagnosisId).get()).data()!;
    assert.equal(stored.source, 'gemini_vision');
    assert.equal(stored.verified, false);
  });

  it('hides the observation and causes when the photo is unclear', async () => {
    const user = await registerUser('photo-unclear');
    activeAdvisor = {
      async suggest(): Promise<PlantPhotoAdvice> {
        return advice({
          observation: 'SECRET UNCLEAR OBSERVATION',
          possibleCauses: ['SECRET CAUSE'],
          careSteps: [],
          uncertainty: 'unclear',
        });
      },
    };

    const response = await diagnose(user, diagnosisImage(user), { language: 'en' });
    assert.equal(response.status, 201, await response.clone().text());
    const body = await response.json();
    assert.equal(body.status, 'uncertain');
    assert.match(String(body.result.label), /clearer photo/i);
    assert.doesNotMatch(JSON.stringify(body.result), /SECRET/i);
    assert.deepEqual(body.result.alternatives, []);
    assert.equal(body.guidance, undefined);
  });

  it('maps provider failures to a clear error and stores nothing', async () => {
    const user = await registerUser('photo-error');
    activeAdvisor = {
      async suggest(): Promise<PlantPhotoAdvice> {
        throw new AiProviderError('Upstream unavailable', 'AI_PROVIDER_ERROR', true);
      },
    };

    const response = await diagnose(user, diagnosisImage(user));
    assert.equal(response.status, 502);
    assert.equal(await errorCode(response), 'AI_PROVIDER_ERROR');
    const list = await (await fetchAs('/api/ai/diagnoses', user.token)).json();
    assert.equal(list.total, 0);
  });

  it('disabled provider returns AI_NOT_CONFIGURED without calling the advisor', async () => {
    const user = await registerUser('photo-disabled');
    activeAdvisor = { async suggest() { return advice(); } };
    advisorCalls.length = 0;
    process.env.DISEASE_PROVIDER = 'none';
    try {
      const response = await diagnose(user, diagnosisImage(user));
      assert.equal(response.status, 503);
      assert.equal(await errorCode(response), 'AI_NOT_CONFIGURED');
      assert.equal(advisorCalls.length, 0);
    } finally {
      process.env.DISEASE_PROVIDER = 'gemini';
    }
  });

  it('rejects image bytes that do not match the declared MIME type', async () => {
    const user = await registerUser('photo-magic-bytes');
    activeAdvisor = { async suggest() { return advice(); } };
    advisorCalls.length = 0;
    const testService = createCloudinaryTestService(cloudinaryState);
    setCloudinaryService({
      ...testService,
      async readAsset() {
        return { data: Buffer.from('not-an-image'), mimeType: 'image/jpeg' };
      },
    });
    try {
      const response = await diagnose(user, diagnosisImage(user));
      assert.equal(response.status, 400);
      assert.equal(await errorCode(response), 'INVALID_IMAGE_FORMAT');
      assert.equal(advisorCalls.length, 0);
    } finally {
      setCloudinaryService(createCloudinaryTestService(cloudinaryState));
    }
  });
});
