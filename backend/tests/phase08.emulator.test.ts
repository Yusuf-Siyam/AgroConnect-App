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
import type { DeliveryJob } from '../src/types/delivery';

const PROJECT_ID = 'demo-agroconnect';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

const firebaseConfig = {
  apiKey: 'emulator-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: '1:000000000000:web:emulator-phase8',
};

type Role = 'farmer' | 'buyer' | 'transporter';
type TestUser = { app: FirebaseApp; auth: Auth; firestore: Firestore; uid: string; token: string };

let server: NetServer;
let baseUrl: string;
let admin: FirebaseAdminServices;
const clientApps: FirebaseApp[] = [];

let createDeliveryJobForOrder: typeof import('../src/services/delivery.js').createDeliveryJobForOrder;
let setTransporterVerification: typeof import('../src/services/transporter.js').setTransporterVerification;

async function registerUser(label: string, role: Role): Promise<TestUser> {
  const app = initializeApp(firebaseConfig, `${label}-${randomUUID()}`);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, FIRESTORE_HOST, FIRESTORE_PORT);

  const email = `${label}-${randomUUID()}@example.com`;
  const credential = await createUserWithEmailAndPassword(auth, email, 'phase8-password-123');
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

async function json(response: Response): Promise<any> {
  return response.json();
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as { error: { code: string } }).error.code;
}

async function expectPermissionDenied(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied');
  });
}

const profilePayload = {
  name: 'Transporter Demo',
  phone: '+8801712345678',
  district: 'Dhaka',
  vehicleType: 'motorcycle',
  plateNumber: 'DH-08-1234',
  capacityKg: 50,
};

async function createProfile(transporter: TestUser, verified = false): Promise<any> {
  const response = await fetchAs('/api/delivery/transporter-profile', transporter.token, {
    method: 'POST',
    body: JSON.stringify(profilePayload),
  });
  assert.equal(response.status, 201, await response.clone().text());
  const profile = await json(response);
  if (verified) await setTransporterVerification(transporter.uid, 'verified');
  return profile;
}

function orderFixture(
  buyer: TestUser,
  farmer: TestUser,
  status: 'accepted' | 'paid' = 'paid',
): Record<string, unknown> {
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
        quantity: 5,
        unitPrice: 100,
        unit: 'kg',
      },
    ],
    status,
    totalAmount: 500,
    deliveryFee: 110,
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

async function writeOrder(order: Record<string, unknown>): Promise<void> {
  await admin.firestore.collection('orders').doc(String(order.id)).set(order);
}

async function jobForOrder(order: Record<string, unknown>): Promise<DeliveryJob> {
  return createDeliveryJobForOrder(order as any);
}

async function acceptJob(transporter: TestUser, jobId: string): Promise<Response> {
  return fetchAs(`/api/delivery/jobs/${jobId}/accept`, transporter.token, { method: 'POST' });
}

async function postJobAction(transporter: TestUser, jobId: string, action: string, body?: unknown): Promise<Response> {
  return fetchAs(`/api/delivery/jobs/${jobId}/${action}`, transporter.token, {
    method: 'POST',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

before(async () => {
  process.env.FIREBASE_PROJECT_ID = PROJECT_ID;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = `${FIRESTORE_HOST}:${FIRESTORE_PORT}`;

  const { createApp } = await import('../src/app.js');
  const { getFirebaseAdmin } = await import('../src/config/firebase.js');
  const deliveryService = await import('../src/services/delivery.js');
  const transporterService = await import('../src/services/transporter.js');
  createDeliveryJobForOrder = deliveryService.createDeliveryJobForOrder;
  setTransporterVerification = transporterService.setTransporterVerification;
  admin = getFirebaseAdmin();

  server = createApp().listen(0);
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

describe('Phase 08 transporter emulator verification', () => {
  it('restricts transporter endpoints and creates a pending profile', async () => {
    const farmer = await registerUser('p8-farmer-role', 'farmer');
    const buyer = await registerUser('p8-buyer-role', 'buyer');
    const transporter = await registerUser('p8-transporter-role', 'transporter');

    assert.equal((await fetchAs('/api/delivery/jobs', buyer.token)).status, 403);
    assert.equal((await fetchAs('/api/delivery/jobs', farmer.token)).status, 403);
    assert.equal((await fetchAs('/api/delivery/jobs')).status, 401);
    assert.equal(
      (
        await fetchAs('/api/delivery/transporter-profile', farmer.token, {
          method: 'POST',
          body: JSON.stringify(profilePayload),
        })
      ).status,
      403,
    );

    const profile = await createProfile(transporter);
    assert.equal(profile.verificationStatus, 'pending');
    assert.equal(profile.isVerified, false);
    assert.equal(profile.capacityKg, 50);

    const duplicate = await fetchAs('/api/delivery/transporter-profile', transporter.token, {
      method: 'POST',
      body: JSON.stringify(profilePayload),
    });
    assert.equal(duplicate.status, 409);
    assert.equal(await errorCode(duplicate), 'PROFILE_EXISTS');

    const updated = await fetchAs('/api/delivery/transporter-profile', transporter.token, {
      method: 'PATCH',
      body: JSON.stringify({ district: 'Chittagong' }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await json(updated)).district, 'Chittagong');

    const jobs = await fetchAs('/api/delivery/jobs', transporter.token);
    assert.equal(jobs.status, 403);
    assert.equal(await errorCode(jobs), 'TRANSPORTER_NOT_VERIFIED');
  });

  it('creates jobs only for paid orders with pickup/dropoff coordinates', async () => {
    const buyer = await registerUser('p8-buyer-jobs', 'buyer');
    const farmer = await registerUser('p8-farmer-jobs', 'farmer');

    const accepted = orderFixture(buyer, farmer, 'accepted');
    await writeOrder(accepted);
    await assert.rejects(jobForOrder(accepted), (error: unknown) => {
      return (error as { code?: string }).code === 'ORDER_NOT_PAID';
    });

    const paid = orderFixture(buyer, farmer, 'paid');
    await writeOrder(paid);
    const job = await jobForOrder(paid);
    assert.equal(job.orderId, paid.id);
    assert.equal(job.buyerId, buyer.uid);
    assert.equal(job.farmerId, farmer.uid);
    assert.equal(job.totalWeightKg, 5);
    assert.equal(job.deliveryFee, 110);
    assert.equal(job.distanceKm! > 0, true);
    assert.equal(job.pickup.latitude, 23.8586);
    assert.equal(job.dropoff.latitude, 23.8103);
    assert.equal(job.transporterId, null);

    await assert.rejects(jobForOrder(paid), (error: unknown) => {
      return (error as { code?: string }).code === 'JOB_EXISTS';
    });
  });

  it('blocks unverified transporters from accepting jobs', async () => {
    const buyer = await registerUser('p8-buyer-unverified', 'buyer');
    const farmer = await registerUser('p8-farmer-unverified', 'farmer');
    const transporter = await registerUser('p8-transporter-unverified', 'transporter');
    await createProfile(transporter);
    const order = orderFixture(buyer, farmer);
    await writeOrder(order);
    const job = await jobForOrder(order);

    const response = await acceptJob(transporter, job.id);
    assert.equal(response.status, 403);
    assert.equal(await errorCode(response), 'TRANSPORTER_NOT_VERIFIED');
  });

  it('lets only one of two concurrent transporters accept a job', async () => {
    const buyer = await registerUser('p8-buyer-race', 'buyer');
    const farmer = await registerUser('p8-farmer-race', 'farmer');
    const t1 = await registerUser('p8-transporter-race-1', 'transporter');
    const t2 = await registerUser('p8-transporter-race-2', 'transporter');
    await createProfile(t1, true);
    await createProfile(t2, true);
    const order = orderFixture(buyer, farmer);
    await writeOrder(order);
    const job = await jobForOrder(order);

    const responses = await Promise.all([acceptJob(t1, job.id), acceptJob(t2, job.id)]);
    const statuses = responses.map((response) => response.status).sort();
    assert.deepEqual(statuses, [200, 409]);
    const failed = responses.find((response) => response.status === 409)!;
    assert.equal(await errorCode(failed), 'JOB_ALREADY_ACCEPTED');

    const stored = await admin.firestore.collection('deliveryJobs').doc(job.id).get();
    assert.ok([t1.uid, t2.uid].includes(stored.get('transporterId')));
    const storedOrder = await admin.firestore.collection('orders').doc(order.id as string).get();
    assert.equal(storedOrder.get('status'), 'shipment_accepted');
    assert.ok(storedOrder.get('transporterId'));
  });

  it('enforces assignment, status steps, delivery code, location and earnings', async () => {
    const buyer = await registerUser('p8-buyer-flow', 'buyer');
    const otherBuyer = await registerUser('p8-other-buyer-flow', 'buyer');
    const farmer = await registerUser('p8-farmer-flow', 'farmer');
    const assigned = await registerUser('p8-transporter-flow', 'transporter');
    const other = await registerUser('p8-transporter-other', 'transporter');
    await createProfile(assigned, true);
    await createProfile(other, true);

    const order = orderFixture(buyer, farmer);
    await writeOrder(order);
    const job = await jobForOrder(order);

    const acceptedResponse = await acceptJob(assigned, job.id);
    assert.equal(acceptedResponse.status, 200, await acceptedResponse.clone().text());
    const accepted = await json(acceptedResponse);
    const deliveryCode: string = accepted.deliveryCode;
    assert.match(deliveryCode, /^\d{6}$/);

    const wrongTransporterCollect = await postJobAction(other, job.id, 'collect');
    assert.equal(wrongTransporterCollect.status, 403);
    assert.equal(await errorCode(wrongTransporterCollect), 'NOT_ASSIGNED_TRANSPORTER');

    const wrongTransporterLocation = await postJobAction(other, job.id, 'location', {
      latitude: 23.8,
      longitude: 90.4,
    });
    assert.equal(wrongTransporterLocation.status, 403);

    const skip = await postJobAction(assigned, job.id, 'ship');
    assert.equal(skip.status, 409);
    assert.equal(await errorCode(skip), 'INVALID_ORDER_TRANSITION');

    const buyerView = await fetchAs(`/api/delivery/buyer/orders/${order.id}/delivery`, buyer.token);
    assert.equal(buyerView.status, 200);
    assert.equal((await json(buyerView)).deliveryCode, deliveryCode);
    const otherBuyerView = await fetchAs(
      `/api/delivery/buyer/orders/${order.id}/delivery`,
      otherBuyer.token,
    );
    assert.equal(otherBuyerView.status, 404);

    const collect = await postJobAction(assigned, job.id, 'collect');
    assert.equal(collect.status, 200, await collect.clone().text());
    const reverse = await postJobAction(assigned, job.id, 'collect');
    assert.equal(reverse.status, 409);

    const location = await postJobAction(assigned, job.id, 'location', {
      latitude: 23.8123,
      longitude: 90.4145,
    });
    assert.equal(location.status, 200, await location.clone().text());
    const throttled = await postJobAction(assigned, job.id, 'location', {
      latitude: 23.8124,
      longitude: 90.4146,
    });
    assert.equal(throttled.status, 429);
    assert.equal(await errorCode(throttled), 'LOCATION_RATE_LIMITED');

    const located = await fetchAs(`/api/delivery/buyer/orders/${order.id}/delivery`, buyer.token);
    const locatedJson = await json(located);
    assert.equal(locatedJson.location.latitude, 23.8123);
    assert.ok(locatedJson.location.recordedAt);
    const otherLocated = await fetchAs(
      `/api/delivery/buyer/orders/${order.id}/delivery`,
      otherBuyer.token,
    );
    assert.equal(otherLocated.status, 404);

    const ship = await postJobAction(assigned, job.id, 'ship');
    assert.equal(ship.status, 200, await ship.clone().text());
    const skipBack = await postJobAction(assigned, job.id, 'collect');
    assert.equal(skipBack.status, 409);

    const wrongCode = await postJobAction(assigned, job.id, 'deliver', { code: '000000' });
    assert.equal(wrongCode.status, 400);
    assert.equal(await errorCode(wrongCode), 'INVALID_DELIVERY_CODE');

    const delivered = await postJobAction(assigned, job.id, 'deliver', { code: deliveryCode });
    assert.equal(delivered.status, 200, await delivered.clone().text());
    assert.equal((await json(delivered)).orderStatus, 'delivered');

    const afterDelivered = await postJobAction(assigned, job.id, 'location', {
      latitude: 23.9,
      longitude: 90.5,
    });
    assert.equal(afterDelivered.status, 409);
    assert.equal(await errorCode(afterDelivered), 'JOB_NOT_ACTIVE');

    const repeatDelivery = await postJobAction(assigned, job.id, 'deliver', { code: deliveryCode });
    assert.equal(repeatDelivery.status, 409);

    const earnings = await admin.firestore.collection('earnings').where('orderId', '==', order.id).get();
    assert.equal(earnings.size, 1);
    const earning = earnings.docs[0].data();
    assert.equal(earning.transporterId, assigned.uid);
    assert.equal(earning.deliveryFee, 110);
    assert.equal(earning.commission, 11);
    assert.equal(earning.netAmount, 99);

    const summaryResponse = await fetchAs('/api/delivery/earnings/summary', assigned.token);
    assert.equal(summaryResponse.status, 200);
    const summary = await json(summaryResponse);
    assert.equal(summary.totalDeliveries, 1);
    assert.equal(summary.totalNetAmount, 99);
    const historyResponse = await fetchAs('/api/delivery/earnings/history', assigned.token);
    assert.equal(historyResponse.status, 200);
    assert.equal((await json(historyResponse)).total, 1);
  });

  it('blocks unauthorized Firestore access and shows no jobs rejected by this transporter', async () => {
    const buyer = await registerUser('p8-buyer-rules', 'buyer');
    const otherBuyer = await registerUser('p8-other-buyer-rules', 'buyer');
    const farmer = await registerUser('p8-farmer-rules', 'farmer');
    const transporter = await registerUser('p8-transporter-rules', 'transporter');
    await createProfile(transporter, true);

    const order = orderFixture(buyer, farmer);
    await writeOrder(order);
    const job = await jobForOrder(order);

    await expectPermissionDenied(
      setDoc(doc(buyer.firestore, 'deliveryJobs', randomUUID()), {
        orderId: randomUUID(),
        buyerId: buyer.uid,
        farmerId: farmer.uid,
        transporterId: null,
      }),
    );
    await expectPermissionDenied(
      setDoc(doc(transporter.firestore, 'transporters', transporter.uid), profilePayload),
    );
    await expectPermissionDenied(
      setDoc(doc(transporter.firestore, 'earnings', randomUUID()), {
        transporterId: transporter.uid,
        netAmount: 1,
      }),
    );
    await expectPermissionDenied(getDoc(doc(otherBuyer.firestore, 'deliveryJobs', job.id)));
    const ownJob = await getDoc(doc(buyer.firestore, 'deliveryJobs', job.id));
    assert.equal(ownJob.exists(), true);

    const rejection = await postJobAction(transporter, job.id, 'reject', { reason: 'Too far' });
    assert.equal(rejection.status, 200, await rejection.clone().text());
    const available = await json(await fetchAs('/api/delivery/jobs', transporter.token));
    assert.equal(available.items.some((item: DeliveryJob) => item.id === job.id), false);
    const hidden = await fetchAs(`/api/delivery/jobs/${job.id}`, transporter.token);
    assert.equal(hidden.status, 404);
  });
});
