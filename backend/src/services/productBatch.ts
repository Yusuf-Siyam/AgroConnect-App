import { randomBytes, randomUUID } from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import type {
  ProductBatch,
  ProductBatchListResponse,
  ProductBatchTraceResponse,
} from '../types/productBatch';
import type {
  CreateProductBatchInput,
  ProductBatchListQuery,
  UpdateProductBatchInput,
} from '../validators/productBatch';
import { requireOwnedHarvestRecord } from './harvestRecord';
import { requireOwnedProduct } from './product';

type TimestampLike = { toDate?: () => Date };

const storedBatchSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(16),
  productId: z.string().min(1),
  farmerId: z.string().min(1),
  harvestRecordId: z.string().optional(),
  quantity: z.number(),
  unit: z.enum(['kg', 'gram', 'mon', 'ton']),
  producedAt: z.string(),
  expiresAt: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  }
  throw new Error('Product batch timestamp is missing or invalid');
}

function parseStored(data: unknown): ProductBatch {
  const raw = storedBatchSchema.parse(data);
  return {
    ...raw,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

function collection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('productBatches');
}

function assertValidBatchDates(input: { producedAt: string; expiresAt?: string }): void {
  if (input.expiresAt && input.expiresAt < input.producedAt) {
    throw new HttpError(400, 'INVALID_BATCH_DATE', 'Invalid batch dates: expires-before-produced.');
  }
}

/** 16 random bytes, base64url encoded => 22 chars; unguessable and URL-safe. */
export function generateBatchCode(): string {
  return randomBytes(16).toString('base64url');
}

export async function requireOwnedProductBatch(farmerId: string, batchId: string): Promise<ProductBatch> {
  const snapshot = await collection().doc(batchId).get();
  if (!snapshot.exists || snapshot.get('farmerId') !== farmerId) {
    throw new HttpError(404, 'PRODUCT_BATCH_NOT_FOUND', 'Product batch not found.');
  }
  return parseStored(snapshot.data());
}

async function assertOwnedReferences(
  farmerId: string,
  input: { productId: string; harvestRecordId?: string },
): Promise<void> {
  await requireOwnedProduct(farmerId, input.productId);
  if (input.harvestRecordId) await requireOwnedHarvestRecord(farmerId, input.harvestRecordId);
}

export async function createProductBatch(
  farmerId: string,
  input: CreateProductBatchInput,
): Promise<ProductBatch> {
  assertValidBatchDates(input);
  await assertOwnedReferences(farmerId, input);

  const { firestore } = getFirebaseAdmin();
  const batchId = randomUUID();
  const batchRef = collection().doc(batchId);

  // Transaction-backed uniqueness: reserve the code before writing the batch.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateBatchCode();
    const codeRef = firestore.collection('productBatchCodes').doc(code);
    try {
      await firestore.runTransaction(async (transaction) => {
        const existing = await transaction.get(codeRef);
        if (existing.exists) throw new HttpError(409, 'BATCH_CODE_CONFLICT', 'Batch code conflict.');
        const now = FieldValue.serverTimestamp();
        transaction.set(codeRef, { batchId, farmerId, createdAt: now });
        transaction.set(batchRef, {
          ...input,
          id: batchId,
          code,
          farmerId,
          createdAt: now,
          updatedAt: now,
        });
      });
      return requireOwnedProductBatch(farmerId, batchId);
    } catch (error) {
      if (error instanceof HttpError && error.code === 'BATCH_CODE_CONFLICT') continue;
      throw error;
    }
  }

  throw new HttpError(503, 'BATCH_CODE_UNAVAILABLE', 'Could not generate a unique batch code.');
}

export async function listProductBatches(
  farmerId: string,
  query: ProductBatchListQuery,
): Promise<ProductBatchListResponse> {
  const snapshot = await collection()
    .where('farmerId', '==', farmerId)
    .orderBy('createdAt', 'desc')
    .get();

  const batches = snapshot.docs
    .map((document) => parseStored(document.data()))
    .filter((batch) => {
      if (query.status && batch.status !== query.status) return false;
      if (query.productId && batch.productId !== query.productId) return false;
      return true;
    });

  return {
    items: batches.slice(query.offset, query.offset + query.limit),
    total: batches.length,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getProductBatch(farmerId: string, batchId: string): Promise<ProductBatch> {
  return requireOwnedProductBatch(farmerId, batchId);
}

export async function updateProductBatch(
  farmerId: string,
  batchId: string,
  input: UpdateProductBatchInput,
): Promise<ProductBatch> {
  const current = await requireOwnedProductBatch(farmerId, batchId);
  const next = { ...current, ...input };
  assertValidBatchDates(next);
  if (input.harvestRecordId !== undefined) {
    await assertOwnedReferences(farmerId, { productId: current.productId, harvestRecordId: input.harvestRecordId });
  }

  await collection()
    .doc(batchId)
    .set({ ...input, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  return requireOwnedProductBatch(farmerId, batchId);
}

export async function deleteProductBatch(farmerId: string, batchId: string): Promise<void> {
  const current = await requireOwnedProductBatch(farmerId, batchId);
  const { firestore } = getFirebaseAdmin();
  await firestore.runTransaction(async (transaction) => {
    transaction.delete(collection().doc(batchId));
    transaction.delete(firestore.collection('productBatchCodes').doc(current.code));
  });
}

function traceNotFound(): HttpError {
  // Same message for unknown/inactive to avoid leaking batch existence.
  return new HttpError(404, 'PRODUCT_BATCH_NOT_FOUND', 'Product batch not found.');
}

export async function traceProductBatch(code: string): Promise<ProductBatchTraceResponse> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await collection().where('code', '==', code).limit(1).get();
  if (snapshot.empty) throw traceNotFound();

  const batch = parseStored(snapshot.docs[0].data());
  if (batch.status !== 'active') throw traceNotFound();

  const [productSnapshot, farmerSnapshot] = await Promise.all([
    firestore.collection('products').doc(batch.productId).get(),
    firestore.collection('users').doc(batch.farmerId).get(),
  ]);

  if (!productSnapshot.exists || productSnapshot.get('deleted') === true) throw traceNotFound();

  const farmerData = farmerSnapshot.exists ? farmerSnapshot.data() : undefined;
  const displayName =
    (typeof farmerData?.displayName === 'string' && farmerData.displayName.trim()) ||
    (typeof farmerData?.name === 'string' && farmerData.name.trim()) ||
    '';
  const district =
    (typeof farmerData?.district === 'string' && farmerData.district.trim()) ||
    (typeof productSnapshot.get('harvestInfo.district') === 'string' &&
      String(productSnapshot.get('harvestInfo.district')).trim()) ||
    '';

  const productName = productSnapshot.get('name') as { bn?: unknown; en?: unknown } | undefined;
  const harvestDate = batch.harvestRecordId
    ? ((await firestore.collection('harvestRecords').doc(batch.harvestRecordId).get()).get('actualHarvestDate') as
        | string
        | undefined) || undefined
    : undefined;

  return {
    code: batch.code,
    productName: {
      bn: typeof productName?.bn === 'string' ? productName.bn : '',
      en: typeof productName?.en === 'string' ? productName.en : '',
    },
    crop:
      (typeof productSnapshot.get('category') === 'string' && String(productSnapshot.get('category'))) ||
      (typeof productSnapshot.get('harvestInfo.variety') === 'string' &&
        String(productSnapshot.get('harvestInfo.variety'))) ||
      '',
    farmerDisplayName: displayName,
    district,
    producedAt: batch.producedAt,
    ...(harvestDate ? { harvestDate } : {}),
    quantity: batch.quantity,
    unit: batch.unit,
    status: batch.status,
  };
}
