import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

const publicEmergencySchema = z.object({
  id: z.string(),
  farmerId: z.string(),
  productId: z.string(),
  originalPrice: z.number(),
  discountPercent: z.number(),
  discountedPrice: z.number(),
  unit: z.enum(['kg', 'gram', 'mon', 'ton']),
  availableQty: z.number().int(),
  soldQty: z.number().int(),
  expiresAt: z.string(),
  status: z.enum(['active', 'expired', 'cancelled', 'sold_out']),
  createdAt: z.string(),
  updatedAt: z.string(),
  productName: z.object({ bn: z.string(), en: z.string() }),
  productImages: z.array(z.string()),
  farmerDisplayName: z.string(),
  district: z.string(),
});

export type PublicEmergencyListing = z.infer<typeof publicEmergencySchema>;

const listSchema = z.object({
  items: z.array(publicEmergencySchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  return result.data;
}

export async function listEmergencyDeals(): Promise<PublicEmergencyListing[]> {
  assertApiConfigured();
  try {
    const res = await api.get('/api/emergency-listings/public', { params: { limit: 100 } });
    return parse(listSchema, res.data).items;
  } catch (e) { throw toApiError(e); }
}
