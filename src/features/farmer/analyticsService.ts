import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

import type { AnalyticsSummary } from './types';

const analyticsSummarySchema = z.object({
  statusCounts: z.object({
    pending: z.number().int(),
    accepted: z.number().int(),
    paid: z.number().int(),
    shipment_accepted: z.number().int(),
    collected: z.number().int(),
    shipped: z.number().int(),
    delivered: z.number().int(),
    rejected: z.number().int(),
    cancelled: z.number().int(),
  }),
  revenue: z.number(),
  paidOrders: z.number().int(),
  topProducts: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      quantity: z.number(),
      revenue: z.number(),
    }),
  ),
  last7Days: z.object({ orders: z.number().int(), revenue: z.number() }),
  last30Days: z.object({ orders: z.number().int(), revenue: z.number() }),
  generatedAt: z.string(),
});

export async function getFarmerAnalytics(): Promise<AnalyticsSummary> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/analytics/farmer');
    const result = analyticsSummarySchema.safeParse(response.data);
    if (!result.success) {
      throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
    }
    return result.data;
  } catch (error) {
    throw toApiError(error);
  }
}
