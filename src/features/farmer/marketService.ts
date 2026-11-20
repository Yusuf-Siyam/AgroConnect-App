import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

import { MARKET_UNITS, type PriceHistory } from './types';

const pricePointSchema = z.object({
  id: z.string(),
  crop: z.string(),
  district: z.string(),
  date: z.string(),
  price: z.number(),
  unit: z.enum(MARKET_UNITS),
  source: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const priceHistorySchema = z.object({
  items: z.array(pricePointSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export async function getPriceHistory(params: {
  crop?: string;
  district?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<PriceHistory> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/market', { params });
    return priceHistorySchema.parse(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}
