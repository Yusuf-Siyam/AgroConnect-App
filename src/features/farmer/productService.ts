import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

import type { Product, ProductList, ProductStats, StockAdjustment, StockHistoryEntry } from './types';
import type { ProductPayload } from './schemas';

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
  deleted: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const productListSchema = z.object({
  items: z.array(productSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

const stockHistoryEntrySchema = z.object({
  id: z.string(),
  productId: z.string(),
  sellerId: z.string(),
  actorId: z.string(),
  previousQuantity: z.number().int(),
  newQuantity: z.number().int(),
  reason: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const productStatsSchema = z.object({
  total: z.number().int(),
  draft: z.number().int(),
  active: z.number().int(),
  outOfStock: z.number().int(),
  lowStock: z.number().int(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  }
  return result.data;
}

export async function listProducts(params: {
  search?: string;
  status?: Product['status'];
  limit: number;
  offset: number;
}): Promise<ProductList> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/products', { params });
    return parseOrThrow(productListSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getProductStats(): Promise<ProductStats> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/products/stats');
    return parseOrThrow(productStatsSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getProduct(productId: string): Promise<Product> {
  assertApiConfigured();
  try {
    const response = await api.get(`/api/products/${productId}`);
    return parseOrThrow(productSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function createProduct(payload: ProductPayload): Promise<Product> {
  assertApiConfigured();
  try {
    const response = await api.post('/api/products', payload);
    return parseOrThrow(productSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateProduct(productId: string, payload: ProductPayload): Promise<Product> {
  assertApiConfigured();
  try {
    const response = await api.patch(`/api/products/${productId}`, payload);
    return parseOrThrow(productSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  assertApiConfigured();
  try {
    await api.delete(`/api/products/${productId}`);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function adjustProductStock(
  productId: string,
  adjustment: StockAdjustment,
): Promise<Product> {
  assertApiConfigured();
  try {
    const response = await api.patch(`/api/products/${productId}/stock`, adjustment);
    return parseOrThrow(productSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listStockHistory(productId: string): Promise<StockHistoryEntry[]> {
  assertApiConfigured();
  try {
    const response = await api.get(`/api/products/${productId}/stock-history`);
    return parseOrThrow(z.array(stockHistoryEntrySchema), response.data);
  } catch (error) {
    throw toApiError(error);
  }
}
