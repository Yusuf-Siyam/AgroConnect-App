import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';
import { PRODUCT_UNITS } from '@/features/farmer/types';

import type { ProductBatchTrace } from './traceTypes';

const traceSchema = z.object({
  code: z.string(),
  productName: z.object({ bn: z.string(), en: z.string() }),
  crop: z.string(),
  farmerDisplayName: z.string(),
  district: z.string(),
  producedAt: z.string(),
  harvestDate: z.string().optional(),
  quantity: z.number(),
  unit: z.enum(PRODUCT_UNITS),
  status: z.enum(['active', 'inactive']),
  reputation: z.object({
    score: z.number().nullable(),
    isNew: z.boolean(),
    reviewCount: z.number().int().min(0),
  }),
});

export async function traceProductBatch(code: string): Promise<ProductBatchTrace> {
  assertApiConfigured();
  try {
    const response = await api.post('/api/product-batches/trace', { code: code.trim() });
    const parsed = traceSchema.safeParse(response.data);
    if (!parsed.success) throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
    return parsed.data;
  } catch (error) {
    throw toApiError(error);
  }
}
