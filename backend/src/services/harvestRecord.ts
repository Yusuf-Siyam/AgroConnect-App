import { randomUUID } from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import type {
  HarvestRecord,
  HarvestRecordListResponse,
  HarvestStatus,
} from '../types/harvestRecord';
import { harvestDateProblem } from '../utils/dates';
import type {
  CreateHarvestRecordInput,
  HarvestRecordListQuery,
  HarvestStatusInput,
  UpdateHarvestRecordInput,
} from '../validators/harvestRecord';
import { requireOwnedProduct } from './product';

type TimestampLike = { toDate?: () => Date };

const storedHarvestRecordSchema = z.object({
  id: z.string().min(1),
  farmerId: z.string().min(1),
  crop: z.string(),
  productId: z.string().optional(),
  plot: z.string().optional(),
  sowingDate: z.string(),
  expectedHarvestDate: z.string(),
  actualHarvestDate: z.string().optional(),
  expectedQuantity: z.number(),
  unit: z.enum(['kg', 'gram', 'mon', 'ton']),
  status: z.enum(['planned', 'growing', 'ready', 'harvested']),
  notes: z.string().optional(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  }
  throw new Error('Harvest record timestamp is missing or invalid');
}

function parseStored(data: unknown): HarvestRecord {
  const raw = storedHarvestRecordSchema.parse(data);
  return {
    ...raw,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

function collection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('harvestRecords');
}

function assertValidDates(record: {
  sowingDate: string;
  expectedHarvestDate: string;
  actualHarvestDate?: string | null;
  status?: HarvestStatus | string;
}): void {
  const problem = harvestDateProblem(record);
  if (problem) {
    throw new HttpError(400, 'INVALID_HARVEST_DATE', `Invalid harvest dates: ${problem}.`);
  }
}

export async function requireOwnedHarvestRecord(
  farmerId: string,
  recordId: string,
): Promise<HarvestRecord> {
  const snapshot = await collection().doc(recordId).get();
  if (!snapshot.exists || snapshot.get('farmerId') !== farmerId) {
    throw new HttpError(404, 'HARVEST_RECORD_NOT_FOUND', 'Harvest record not found.');
  }
  return parseStored(snapshot.data());
}

async function assertOwnedProduct(farmerId: string, productId: string | undefined): Promise<void> {
  if (productId) await requireOwnedProduct(farmerId, productId);
}

export async function createHarvestRecord(
  farmerId: string,
  input: CreateHarvestRecordInput,
): Promise<HarvestRecord> {
  assertValidDates(input);
  await assertOwnedProduct(farmerId, input.productId);

  const recordId = randomUUID();
  const now = FieldValue.serverTimestamp();
  await collection().doc(recordId).set({
    ...input,
    id: recordId,
    farmerId,
    createdAt: now,
    updatedAt: now,
  });

  return requireOwnedHarvestRecord(farmerId, recordId);
}

export async function listHarvestRecords(
  farmerId: string,
  query: HarvestRecordListQuery,
): Promise<HarvestRecordListResponse> {
  const snapshot = await collection()
    .where('farmerId', '==', farmerId)
    .orderBy('createdAt', 'desc')
    .get();

  const needle = query.crop?.toLocaleLowerCase();
  const records = snapshot.docs
    .map((document) => parseStored(document.data()))
    .filter((record) => {
      if (query.status && record.status !== query.status) return false;
      if (needle && !record.crop.toLocaleLowerCase().includes(needle)) return false;
      if (query.from && record.expectedHarvestDate < query.from) return false;
      if (query.to && record.expectedHarvestDate > query.to) return false;
      return true;
    });

  return {
    items: records.slice(query.offset, query.offset + query.limit),
    total: records.length,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getHarvestRecord(farmerId: string, recordId: string): Promise<HarvestRecord> {
  return requireOwnedHarvestRecord(farmerId, recordId);
}

export async function updateHarvestRecord(
  farmerId: string,
  recordId: string,
  input: UpdateHarvestRecordInput,
): Promise<HarvestRecord> {
  const current = await requireOwnedHarvestRecord(farmerId, recordId);
  const next = { ...current, ...input };
  assertValidDates(next);
  await assertOwnedProduct(farmerId, next.productId);

  await collection()
    .doc(recordId)
    .set({ ...input, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  return requireOwnedHarvestRecord(farmerId, recordId);
}

export async function setHarvestRecordStatus(
  farmerId: string,
  recordId: string,
  input: HarvestStatusInput,
): Promise<HarvestRecord> {
  const current = await requireOwnedHarvestRecord(farmerId, recordId);
  const actualHarvestDate = input.actualHarvestDate ?? current.actualHarvestDate;
  assertValidDates({
    sowingDate: current.sowingDate,
    expectedHarvestDate: current.expectedHarvestDate,
    actualHarvestDate,
    status: input.status,
  });

  await collection().doc(recordId).set(
    {
      status: input.status,
      ...(input.actualHarvestDate ? { actualHarvestDate: input.actualHarvestDate } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return requireOwnedHarvestRecord(farmerId, recordId);
}

export async function deleteHarvestRecord(farmerId: string, recordId: string): Promise<void> {
  await requireOwnedHarvestRecord(farmerId, recordId);
  await collection().doc(recordId).delete();
}
