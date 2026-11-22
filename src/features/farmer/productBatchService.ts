import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

import type { ProductBatchPayload } from './productBatchSchemas';
import { PRODUCT_BATCH_STATUSES, type ProductBatch, type ProductBatchList } from './productBatchTypes';
import { PRODUCT_UNITS } from './types';

const productBatchSchema = z.object({
  id: z.string(),
  code: z.string(),
  productId: z.string(),
  farmerId: z.string(),
  harvestRecordId: z.string().optional(),
  quantity: z.number(),
  unit: z.enum(PRODUCT_UNITS),
  producedAt: z.string(),
  expiresAt: z.string().optional(),
  status: z.enum(PRODUCT_BATCH_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const productBatchListSchema = z.object({
  items: z.array(productBatchSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  return result.data;
}

export async function listProductBatches(params: {
  status?: ProductBatch['status'];
  productId?: string;
  limit: number;
  offset: number;
}): Promise<ProductBatchList> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/product-batches', { params });
    return parseOrThrow(productBatchListSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getProductBatch(batchId: string): Promise<ProductBatch> {
  assertApiConfigured();
  try {
    const response = await api.get(`/api/product-batches/${batchId}`);
    return parseOrThrow(productBatchSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function createProductBatch(payload: ProductBatchPayload): Promise<ProductBatch> {
  assertApiConfigured();
  try {
    const response = await api.post('/api/product-batches', payload);
    return parseOrThrow(productBatchSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateProductBatch(batchId: string, payload: Partial<ProductBatchPayload>): Promise<ProductBatch> {
  assertApiConfigured();
  try {
    const response = await api.patch(`/api/product-batches/${batchId}`, payload);
    return parseOrThrow(productBatchSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function deleteProductBatch(batchId: string): Promise<void> {
  assertApiConfigured();
  try {
    await api.delete(`/api/product-batches/${batchId}`);
  } catch (error) {
    throw toApiError(error);
  }
}
