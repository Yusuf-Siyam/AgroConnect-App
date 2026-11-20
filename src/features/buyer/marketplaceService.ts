import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

import type {
  CategoryList,
  FarmerProfile,
  MarketplaceFilters,
  Product,
  ProductList,
} from './types';

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

const productListSchema = z.object({
  items: z.array(productSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

const categoryListSchema = z.object({
  items: z.array(
    z.object({ id: z.string(), name: z.object({ bn: z.string(), en: z.string() }) }),
  ),
});

const farmerProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  district: z.string().optional(),
  photoURL: z.string().optional(),
  ratingSummary: z.object({ average: z.number(), count: z.number().int() }),
  productCount: z.number().int(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  }
  return result.data;
}

function cleanParams(filters: MarketplaceFilters): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {
    sort: filters.sort,
    limit: filters.limit,
    offset: filters.offset,
  };
  if (filters.search?.trim()) params.search = filters.search.trim();
  if (filters.category) params.category = filters.category;
  if (filters.minPrice !== undefined) params.minPrice = filters.minPrice;
  if (filters.maxPrice !== undefined) params.maxPrice = filters.maxPrice;
  if (filters.district?.trim()) params.district = filters.district.trim();
  if (filters.unit) params.unit = filters.unit;
  if (filters.inStock !== undefined) params.inStock = filters.inStock;
  return params;
}

export async function listMarketplaceProducts(filters: MarketplaceFilters): Promise<ProductList> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/marketplace/products', {
      params: cleanParams(filters),
    });
    return parseOrThrow(productListSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getMarketplaceProduct(id: string): Promise<Product> {
  assertApiConfigured();
  try {
    const response = await api.get(`/api/marketplace/products/${id}`);
    return parseOrThrow(productSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listCategories(): Promise<CategoryList> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/categories');
    return parseOrThrow(categoryListSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getFarmerProfile(farmerId: string): Promise<FarmerProfile> {
  assertApiConfigured();
  try {
    const response = await api.get(`/api/farmers/${farmerId}`);
    return parseOrThrow(farmerProfileSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}
