import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

import type { CartResponse } from './types';

const cartItemSchema = z.object({
  productId: z.string(),
  sellerId: z.string(),
  name: z.object({ bn: z.string(), en: z.string() }),
  imageUrl: z.string().optional(),
  unit: z.enum(['kg', 'gram', 'mon', 'ton']),
  quantity: z.number().int(),
  minOrderQty: z.number().int(),
  stock: z.number().int(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  available: z.boolean(),
  unavailableReason: z.enum(['PRODUCT_NOT_FOUND', 'PRODUCT_UNAVAILABLE', 'OWN_PRODUCT']).optional(),
});

const cartSchema = z.object({
  items: z.array(cartItemSchema),
  total: z.number().int(),
  farmerCount: z.number().int(),
  updatedAt: z.string().optional(),
});

function parseOrThrow(data: unknown): CartResponse {
  const result = cartSchema.safeParse(data);
  if (!result.success) {
    throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  }
  return result.data;
}

export async function getCart(): Promise<CartResponse> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/cart');
    return parseOrThrow(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function addToCart(productId: string, quantity: number): Promise<CartResponse> {
  assertApiConfigured();
  try {
    const response = await api.post('/api/cart/items', { productId, quantity });
    return parseOrThrow(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateCartItem(productId: string, quantity: number): Promise<CartResponse> {
  assertApiConfigured();
  try {
    const response = await api.patch(`/api/cart/items/${productId}`, { quantity });
    return parseOrThrow(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function removeCartItem(productId: string): Promise<CartResponse> {
  assertApiConfigured();
  try {
    const response = await api.delete(`/api/cart/items/${productId}`);
    return parseOrThrow(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function clearCart(): Promise<CartResponse> {
  assertApiConfigured();
  try {
    const response = await api.delete('/api/cart');
    return parseOrThrow(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}
