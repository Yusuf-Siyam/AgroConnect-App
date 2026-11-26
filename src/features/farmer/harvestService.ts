import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

import type { HarvestPayload, HarvestUpdatePayload } from './harvestSchemas';
import { PRODUCT_UNITS } from './types';
import type { HarvestRecord, HarvestRecordList, HarvestStatusUpdate } from './harvestTypes';

const harvestRecordSchema = z.object({
  id: z.string(),
  farmerId: z.string(),
  crop: z.string(),
  productId: z.string().optional(),
  plot: z.string().optional(),
  sowingDate: z.string(),
  expectedHarvestDate: z.string(),
  actualHarvestDate: z.string().optional(),
  expectedQuantity: z.number(),
  unit: z.enum(PRODUCT_UNITS),
  status: z.enum(['planned', 'growing', 'ready', 'harvested']),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const harvestListSchema = z.object({
  items: z.array(harvestRecordSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  }
  return result.data;
}

export async function listHarvestRecords(params: {
  status?: HarvestRecord['status'];
  crop?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}): Promise<HarvestRecordList> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/harvest-records', { params });
    return parseOrThrow(harvestListSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getHarvestRecord(recordId: string): Promise<HarvestRecord> {
  assertApiConfigured();
  try {
    const response = await api.get(`/api/harvest-records/${recordId}`);
    return parseOrThrow(harvestRecordSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function createHarvestRecord(payload: HarvestPayload): Promise<HarvestRecord> {
  assertApiConfigured();
  try {
    const response = await api.post('/api/harvest-records', payload);
    return parseOrThrow(harvestRecordSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateHarvestRecord(
  recordId: string,
  payload: HarvestUpdatePayload,
): Promise<HarvestRecord> {
  assertApiConfigured();
  try {
    const response = await api.patch(`/api/harvest-records/${recordId}`, payload);
    return parseOrThrow(harvestRecordSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function setHarvestRecordStatus(
  recordId: string,
  update: HarvestStatusUpdate,
): Promise<HarvestRecord> {
  assertApiConfigured();
  try {
    const response = await api.post(`/api/harvest-records/${recordId}/status`, update);
    return parseOrThrow(harvestRecordSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function deleteHarvestRecord(recordId: string): Promise<void> {
  assertApiConfigured();
  try {
    await api.delete(`/api/harvest-records/${recordId}`);
  } catch (error) {
    throw toApiError(error);
  }
}
