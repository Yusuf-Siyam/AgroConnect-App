import { randomUUID } from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';

import {
  calculateCommission,
  DELIVERY_PRICING,
  roundMoney,
} from '../config/deliveryPricing';
import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import { assertAllowedOrderTransition, notifyOrderTransition } from '../services/orderStatus';
import { createStatusEvent, getOrder, ordersCollection, serializeOrder } from '../services/order';
import { recomputeFarmerReputationsForOrder } from '../services/reputation';
import type {
  BuyerDelivery,
  DeliveryJob,
  DeliveryJobList,
  DeliveryLocation,
  EarningsHistory,
  EarningsRecord,
  EarningsSummary,
  TransporterProfile,
} from '../types/delivery';
import type { Order } from '../types/order';
import type { ProductUnit } from '../types/product';
import { haversineDistanceKm, type Coordinates } from '../utils/geo';
import { toKilograms } from '../utils/units';
import type {
  DeliveryCodeInput,
  LocationInput,
  PaginationInput,
  RejectJobInput,
} from '../validators/delivery';
import { requireVerifiedTransporter } from './transporter';

const LOCATION_RATE_LIMIT_MS = 10_000;
const DELIVERY_CODE_ATTEMPT_LIMIT = 5;
const DELIVERY_CODE_LOCK_MS = 5 * 60_000;
const ACTIVE_LOCATION_STATUSES = ['shipment_accepted', 'collected', 'shipped'] as const;

type StoredJob = Omit<
  DeliveryJob,
  'id' | 'createdAt' | 'updatedAt' | 'codeLockedUntil' | 'location'
> & {
  codeLockedUntil?: unknown;
  location?: unknown;
  createdAt: unknown;
  updatedAt: unknown;
};

function jobsCollection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('deliveryJobs');
}

function earningsCollection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('earnings');
}

/** Notification hooks run only after a committed delivery transaction. */
async function safeNotifyDeliveryStatus(
  orderId: string,
  to: 'shipment_accepted' | 'collected' | 'shipped' | 'delivered',
): Promise<void> {
  try {
    const order = await getOrder(orderId);
    if (order) {
      await notifyOrderTransition(order, to, 'transporter');
      if (to === 'delivered') await recomputeFarmerReputationsForOrder(order);
    }
  } catch (error) {
    console.error('[delivery] notification hook failed (non-fatal)', error);
  }
}

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  throw new Error('Delivery timestamp is missing or invalid');
}

function serializeJob(id: string, data: FirebaseFirestore.DocumentData): DeliveryJob {
  return {
    id,
    orderId: String(data.orderId),
    buyerId: String(data.buyerId),
    farmerId: String(data.farmerId),
    pickup: data.pickup,
    dropoff: data.dropoff,
    totalWeightKg: Number(data.totalWeightKg),
    distanceKm: data.distanceKm === null ? null : Number(data.distanceKm),
    deliveryFee: Number(data.deliveryFee),
    commission: Number(data.commission),
    netAmount: Number(data.netAmount),
    transporterId: data.transporterId ? String(data.transporterId) : null,
    orderStatus: data.orderStatus,
    ...(data.location
      ? {
          location: {
            ...data.location,
            recordedAt: toIsoString(data.location.recordedAt),
          } as DeliveryLocation,
        }
      : {}),
    rejectedBy: Array.isArray(data.rejectedBy) ? data.rejectedBy.map(String) : [],
    deliveryCode: data.deliveryCode ? String(data.deliveryCode) : null,
    codeAttempts: Number(data.codeAttempts ?? 0),
    codeLockedUntil: data.codeLockedUntil
      ? toIsoString(data.codeLockedUntil)
      : null,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function jobForOrderQuery(orderId: string) {
  return jobsCollection().where('orderId', '==', orderId).limit(1).get();
}

function generateDeliveryCode(): string {
  const bytes = randomUUID().replaceAll('-', '');
  return String((parseInt(bytes.slice(0, 12), 16) % 1_000_000)).padStart(6, '0');
}

function candidateCoordinates(value: unknown): Coordinates | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const latitude = record.latitude;
  const longitude = record.longitude;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  return { latitude, longitude };
}


/**
 * Creates the single delivery job for a paid order. Phase 07B (payments) will
 * call this after verified payment; no API route creates jobs directly.
 */
export async function createDeliveryJobForOrder(order: Order): Promise<DeliveryJob> {
  if (order.status !== 'paid') {
    throw new HttpError(409, 'ORDER_NOT_PAID', 'Delivery jobs can only be created for paid orders.');
  }
  if (!order.deliveryAddress) {
    throw new HttpError(400, 'DELIVERY_ADDRESS_REQUIRED', 'The order has no delivery address.');
  }
  if (!order.deliveryFee || order.deliveryFee <= 0) {
    throw new HttpError(
      400,
      'DELIVERY_FEE_REQUIRED',
      'The paid order must snapshot a positive delivery fee.',
    );
  }

  const existing = await jobForOrderQuery(order.id);
  if (!existing.empty) {
    throw new HttpError(409, 'JOB_EXISTS', 'A delivery job already exists for this order.');
  }

  const pickupCoords = candidateCoordinates(order.pickupAddress);
  const dropoffCoords = candidateCoordinates(order.deliveryAddress);
  const distanceKm =
    pickupCoords && dropoffCoords
      ? haversineDistanceKm(pickupCoords, dropoffCoords)
      : null;

  let totalWeightKg = 0;
  for (const item of order.items) {
    totalWeightKg += toKilograms(item.quantity, item.unit as ProductUnit);
  }
  totalWeightKg = Math.round(totalWeightKg * 100) / 100;

  // Fee must already be snapshotted by Phase 07B using calculateDeliveryFee().
  const commission = calculateCommission(order.deliveryFee);
  const netAmount = roundMoney(order.deliveryFee - commission);
  const now = FieldValue.serverTimestamp();
  const data: StoredJob = {
    orderId: order.id,
    buyerId: order.buyerId,
    farmerId: order.sellerIds[0] ?? '',
    pickup: {
      farmerId: order.sellerIds[0] ?? '',
      ...(order.pickupAddress?.addressLine
        ? { addressLine: order.pickupAddress.addressLine }
        : {}),
      ...(order.pickupAddress?.district ? { district: order.pickupAddress.district } : {}),
      ...(pickupCoords ?? {}),
    },
    dropoff: {
      buyerId: order.buyerId,
      addressLine: order.deliveryAddress.addressLine,
      district: order.deliveryAddress.district,
      phoneNumber: order.deliveryAddress.phoneNumber,
      ...(dropoffCoords ?? {}),
    },
    totalWeightKg,
    distanceKm,
    deliveryFee: order.deliveryFee,
    commission,
    netAmount,
    transporterId: null,
    orderStatus: order.status,
    rejectedBy: [],
    deliveryCode: null,
    codeAttempts: 0,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await jobsCollection().add(data);
  return serializeJob(ref.id, (await ref.get()).data()!);
}

async function requireJob(jobId: string): Promise<{ id: string; job: DeliveryJob }> {
  const snapshot = await jobsCollection().doc(jobId).get();
  if (!snapshot.exists) throw new HttpError(404, 'JOB_NOT_FOUND', 'Delivery job not found.');
  return { id: jobId, job: serializeJob(jobId, snapshot.data()!) };
}

export async function listAvailableJobs(
  transporterId: string,
  query: PaginationInput,
): Promise<DeliveryJobList> {
  await requireVerifiedTransporter(transporterId);
  const snapshot = await jobsCollection()
    .where('transporterId', '==', null)
    .where('orderStatus', '==', 'paid')
    .get();
  const jobs = snapshot.docs
    .map((doc) => serializeJob(doc.id, doc.data()))
    .filter((job) => !job.rejectedBy.includes(transporterId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    items: jobs.slice(query.offset, query.offset + query.limit),
    total: jobs.length,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getDeliveryJob(
  transporterId: string,
  jobId: string,
): Promise<DeliveryJob> {
  const { job } = await requireJob(jobId);
  if (job.transporterId && job.transporterId !== transporterId) {
    throw new HttpError(404, 'JOB_NOT_FOUND', 'Delivery job not found.');
  }
  if (job.rejectedBy.includes(transporterId)) {
    throw new HttpError(404, 'JOB_NOT_FOUND', 'Delivery job not found.');
  }
  return job;
}

export async function listMyDeliveries(
  transporterId: string,
  query: PaginationInput,
): Promise<DeliveryJobList> {
  const snapshot = await jobsCollection().where('transporterId', '==', transporterId).get();
  const jobs = snapshot.docs
    .map((doc) => serializeJob(doc.id, doc.data()))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    items: jobs.slice(query.offset, query.offset + query.limit),
    total: jobs.length,
    limit: query.limit,
    offset: query.offset,
  };
}

/** Exactly one transporter wins under concurrent accepts. */
export async function acceptDeliveryJob(
  transporterId: string,
  jobId: string,
): Promise<DeliveryJob> {
  await requireVerifiedTransporter(transporterId);
  const { firestore } = getFirebaseAdmin();
  const jobRef = jobsCollection().doc(jobId);

  const accepted = await firestore.runTransaction(async (transaction) => {
    const jobSnapshot = await transaction.get(jobRef);
    if (!jobSnapshot.exists) throw new HttpError(404, 'JOB_NOT_FOUND', 'Delivery job not found.');
    const job = serializeJob(jobId, jobSnapshot.data()!);
    if (job.transporterId) {
      throw new HttpError(409, 'JOB_ALREADY_ACCEPTED', 'This job was already accepted.');
    }
    if (job.rejectedBy.includes(transporterId)) {
      throw new HttpError(409, 'JOB_REJECTED', 'You previously rejected this job.');
    }
    if (job.orderStatus !== 'paid') {
      throw new HttpError(409, 'JOB_NOT_AVAILABLE', 'This job is no longer available.');
    }

    const orderRef = ordersCollection().doc(job.orderId);
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const order = serializeOrder(orderSnapshot.data());
    assertAllowedOrderTransition('transporter', order.status, 'shipment_accepted');

    const at = new Date().toISOString();
    const event = createStatusEvent({
      from: order.status,
      to: 'shipment_accepted',
      actorId: transporterId,
      actorRole: 'transporter',
      at,
    });
    transaction.update(jobRef, {
      transporterId,
      orderStatus: 'shipment_accepted',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(orderRef, {
      status: 'shipment_accepted',
      transporterId,
      statusHistory: FieldValue.arrayUnion(event),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(orderRef.collection('statusHistory').doc(event.id), event);

    return {
      ...job,
      transporterId,
      orderStatus: 'shipment_accepted' as const,
    };
  });

  await safeNotifyDeliveryStatus(accepted.orderId, 'shipment_accepted');
  return accepted;
}

export async function rejectDeliveryJob(
  transporterId: string,
  jobId: string,
  input: RejectJobInput,
): Promise<DeliveryJob> {
  const { firestore } = getFirebaseAdmin();
  const ref = jobsCollection().doc(jobId);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpError(404, 'JOB_NOT_FOUND', 'Delivery job not found.');
    const job = serializeJob(jobId, snapshot.data()!);
    if (job.transporterId && job.transporterId !== transporterId) {
      throw new HttpError(404, 'JOB_NOT_FOUND', 'Delivery job not found.');
    }
    if (job.orderStatus !== 'paid') {
      throw new HttpError(409, 'JOB_NOT_AVAILABLE', 'This job can no longer be rejected.');
    }
    transaction.update(ref, {
      rejectedBy: FieldValue.arrayUnion(transporterId),
      updatedAt: FieldValue.serverTimestamp(),
    });
    void input;
  });
  return (await requireJob(jobId)).job;
}

async function updateJobAndOrderStatus(
  transporterId: string,
  jobId: string,
  to: 'collected' | 'shipped' | 'delivered',
  extraJobUpdates: Record<string, unknown> = {},
): Promise<DeliveryJob> {
  const { firestore } = getFirebaseAdmin();
  const jobRef = jobsCollection().doc(jobId);

  const updated = await firestore.runTransaction(async (transaction) => {
    const jobSnapshot = await transaction.get(jobRef);
    if (!jobSnapshot.exists) throw new HttpError(404, 'JOB_NOT_FOUND', 'Delivery job not found.');
    const job = serializeJob(jobId, jobSnapshot.data()!);
    if (job.transporterId !== transporterId) {
      throw new HttpError(403, 'NOT_ASSIGNED_TRANSPORTER', 'You are not assigned to this job.');
    }
    assertAllowedOrderTransition('transporter', job.orderStatus, to);

    const orderRef = ordersCollection().doc(job.orderId);
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const order = serializeOrder(orderSnapshot.data());
    assertAllowedOrderTransition('transporter', order.status, to);

    const earningsRef = to === 'delivered' ? earningsCollection().doc(job.orderId) : null;
    const existingEarnings =
      earningsRef && to === 'delivered' ? await transaction.get(earningsRef) : null;

    const at = new Date().toISOString();
    const event = createStatusEvent({
      from: order.status,
      to,
      actorId: transporterId,
      actorRole: 'transporter',
      at,
    });

    transaction.update(jobRef, {
      orderStatus: to,
      updatedAt: FieldValue.serverTimestamp(),
      ...extraJobUpdates,
    });
    transaction.update(orderRef, {
      status: to,
      statusHistory: FieldValue.arrayUnion(event),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(orderRef.collection('statusHistory').doc(event.id), event);

    if (to === 'delivered' && earningsRef && existingEarnings && !existingEarnings.exists) {
      const now = FieldValue.serverTimestamp();
      transaction.set(earningsRef, {
        id: job.orderId,
        transporterId,
        orderId: job.orderId,
        jobId,
        deliveryFee: job.deliveryFee,
        commission: job.commission,
        netAmount: job.netAmount,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      ...job,
      orderStatus: to,
      ...extraJobUpdates,
    } as DeliveryJob;
  });

  await safeNotifyDeliveryStatus(updated.orderId, to);
  return updated;
}

export function confirmPickup(transporterId: string, jobId: string): Promise<DeliveryJob> {
  return updateJobAndOrderStatus(transporterId, jobId, 'collected', {
    deliveryCode: generateDeliveryCode(),
    codeAttempts: 0,
    codeLockedUntil: null,
  });
}

export function startDelivery(transporterId: string, jobId: string): Promise<DeliveryJob> {
  return updateJobAndOrderStatus(transporterId, jobId, 'shipped');
}

export async function confirmDelivery(
  transporterId: string,
  jobId: string,
  input: DeliveryCodeInput,
): Promise<DeliveryJob> {
  const { job } = await requireJob(jobId);
  if (job.transporterId !== transporterId) {
    throw new HttpError(403, 'NOT_ASSIGNED_TRANSPORTER', 'You are not assigned to this job.');
  }
  if (job.orderStatus !== 'shipped') {
    throw new HttpError(409, 'INVALID_ORDER_STATUS', 'The job is not ready for delivery.');
  }
  if (!job.deliveryCode) {
    throw new HttpError(409, 'DELIVERY_CODE_UNAVAILABLE', 'Delivery code is unavailable.');
  }
  if (job.codeLockedUntil && new Date(job.codeLockedUntil).getTime() > Date.now()) {
    throw new HttpError(429, 'DELIVERY_CODE_LOCKED', 'Too many wrong attempts. Try again later.');
  }

  const { firestore } = getFirebaseAdmin();
  const ref = jobsCollection().doc(jobId);
  const lockedUntil = new Date(Date.now() + DELIVERY_CODE_LOCK_MS).toISOString();
  const attempts = job.codeAttempts + 1;

  if (input.code !== job.deliveryCode) {
    await ref.update({
      codeAttempts: attempts,
      ...(attempts >= DELIVERY_CODE_ATTEMPT_LIMIT ? { codeLockedUntil: lockedUntil } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw new HttpError(
      400,
      'INVALID_DELIVERY_CODE',
      attempts >= DELIVERY_CODE_ATTEMPT_LIMIT
        ? 'Too many wrong attempts. Try again later.'
        : 'Delivery code is incorrect.',
    );
  }

  return updateJobAndOrderStatus(transporterId, jobId, 'delivered', {
    codeAttempts: 0,
    codeLockedUntil: null,
  });
}

export async function updateJobLocation(
  transporterId: string,
  jobId: string,
  location: LocationInput,
): Promise<DeliveryJob> {
  const { job } = await requireJob(jobId);
  if (job.transporterId !== transporterId) {
    throw new HttpError(403, 'NOT_ASSIGNED_TRANSPORTER', 'You are not assigned to this job.');
  }
  if (!(ACTIVE_LOCATION_STATUSES as readonly string[]).includes(job.orderStatus)) {
    throw new HttpError(409, 'JOB_NOT_ACTIVE', 'Location is only accepted during an active job.');
  }

  const { firestore } = getFirebaseAdmin();
  const ref = jobsCollection().doc(jobId);
  const now = Date.now();
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpError(404, 'JOB_NOT_FOUND', 'Delivery job not found.');
    const current = serializeJob(jobId, snapshot.data()!);
    const lastRecorded = current.location?.recordedAt
      ? new Date(current.location.recordedAt).getTime()
      : 0;
    if (now - lastRecorded < LOCATION_RATE_LIMIT_MS) {
      throw new HttpError(429, 'LOCATION_RATE_LIMITED', 'Location updates are throttled.');
    }
    const storedLocation: DeliveryLocation = { ...location, recordedAt: new Date(now).toISOString() };
    transaction.update(ref, {
      location: storedLocation,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return (await requireJob(jobId)).job;
}

export async function getBuyerDelivery(
  buyerId: string,
  orderId: string,
): Promise<BuyerDelivery> {
  const orderSnapshot = await ordersCollection().doc(orderId).get();
  if (!orderSnapshot.exists) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const order = serializeOrder(orderSnapshot.data());
  if (order.buyerId !== buyerId) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const result = await jobForOrderQuery(orderId);
  if (result.empty) {
    return {
      orderId,
      orderStatus: order.status,
      transporterId: order.transporterId ?? null,
      deliveryCode: null,
      location: null,
    };
  }
  const job = serializeJob(result.docs[0].id, result.docs[0].data());
  return {
    orderId,
    orderStatus: job.orderStatus,
    transporterId: job.transporterId,
    deliveryCode: job.deliveryCode,
    location: job.location ?? null,
  };
}

function serializeEarnings(id: string, data: FirebaseFirestore.DocumentData): EarningsRecord {
  return {
    id,
    transporterId: String(data.transporterId),
    orderId: String(data.orderId),
    jobId: String(data.jobId),
    deliveryFee: Number(data.deliveryFee),
    commission: Number(data.commission),
    netAmount: Number(data.netAmount),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

export async function getEarningsSummary(transporterId: string): Promise<EarningsSummary> {
  const snapshot = await earningsCollection().where('transporterId', '==', transporterId).get();
  const records = snapshot.docs.map((doc) => serializeEarnings(doc.id, doc.data()));
  return {
    totalDeliveries: records.length,
    totalDeliveryFee: records.reduce((sum, record) => sum + record.deliveryFee, 0),
    totalCommission: records.reduce((sum, record) => sum + record.commission, 0),
    totalNetAmount: records.reduce((sum, record) => sum + record.netAmount, 0),
  };
}

export async function listEarnings(
  transporterId: string,
  query: PaginationInput,
): Promise<EarningsHistory> {
  const snapshot = await earningsCollection().where('transporterId', '==', transporterId).get();
  const records = snapshot.docs
    .map((doc) => serializeEarnings(doc.id, doc.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    items: records.slice(query.offset, query.offset + query.limit),
    total: records.length,
    limit: query.limit,
    offset: query.offset,
  };
}

export function pricingPlaceholder() {
  return DELIVERY_PRICING;
}

export async function requireTransporterAccess(transporterId: string): Promise<TransporterProfile> {
  return requireVerifiedTransporter(transporterId);
}
