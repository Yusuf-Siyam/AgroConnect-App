import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

import type { ProductList } from './types';

const productSchema = z.object({
  id: z.string(),
  sellerId: z.string(),
  name: z.object({ bn: z.string(), en: z.string() }),
  category: z.string(),
  description: z.object({ bn: z.string(), en: z.string() }),
  price: z.number(),
  unit: z.enum(['kg', 'gram', 'mon', 'ton']),
  stock: z.number().int(),
  lowStockThreshold: z.number().int(),
  minOrderQty: z.number().int(),
  harvestDate: z.string(),
  harvestInfo: z.object({ district: z.string(), variety: z.string() }),
  images: z.array(z.string()),
  status: z.enum(['draft', 'active', 'out_of_stock']),
  ratingSummary: z.object({ average: z.number(), count: z.number().int() }).default({ average: 0, count: 0 }),
  deleted: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const listSchema = z.object({
  items: z.array(productSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

function parseOrThrow(data: unknown): ProductList {
  const result = listSchema.safeParse(data);
  if (!result.success) {
    throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  }
  return result.data;
}

export async function listWishlist(limit = 10, offset = 0): Promise<ProductList> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/wishlist', { params: { limit, offset } });
    return parseOrThrow(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function addToWishlist(productId: string): Promise<ProductList> {
  assertApiConfigured();
  try {
    const response = await api.post('/api/wishlist/items', { productId });
    return parseOrThrow(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function removeFromWishlist(productId: string): Promise<ProductList> {
  assertApiConfigured();
  try {
    const response = await api.delete(`/api/wishlist/items/${productId}`);
    return parseOrThrow(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}
