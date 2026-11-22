import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

export const emergencyListingSchema = z.object({
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
});

export type EmergencyListing = z.infer<typeof emergencyListingSchema>;

const listSchema = z.object({
  items: z.array(emergencyListingSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  return result.data;
}

export async function listMyEmergencyListings(): Promise<EmergencyListing[]> {
  assertApiConfigured();
  try {
    const res = await api.get('/api/emergency-listings/mine', { params: { limit: 100 } });
    return parse(listSchema, res.data).items;
  } catch (e) { throw toApiError(e); }
}

export async function createEmergencyListing(input: {
  productId: string; discountPercent: number; availableQty: number; expiresInHours: number;
}): Promise<EmergencyListing> {
  assertApiConfigured();
  try {
    const res = await api.post('/api/emergency-listings', input);
    return parse(emergencyListingSchema, res.data);
  } catch (e) { throw toApiError(e); }
}

export async function updateEmergencyListing(id: string, input: Record<string, unknown>): Promise<EmergencyListing> {
  assertApiConfigured();
  try {
    const res = await api.patch(`/api/emergency-listings/${id}`, input);
    return parse(emergencyListingSchema, res.data);
  } catch (e) { throw toApiError(e); }
}

export async function cancelEmergencyListing(id: string): Promise<EmergencyListing> {
  return updateEmergencyListing(id, { status: 'cancelled' });
}
