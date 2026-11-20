import { z } from 'zod';

import { PRODUCT_STATUSES, PRODUCT_UNITS } from '../types/product';

const localizedTextSchema = z
  .object({
    bn: z.string().trim().min(1).max(200),
    en: z.string().trim().min(1).max(200),
  })
  .strict();

const imageUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https:\/\//i.test(value), 'Use an HTTPS Storage URL')
  .refine((value) => /\.(jpe?g|png|webp)$/i.test(new URL(value).pathname), 'Unsupported image type');

const productIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Invalid product id');

export const createProductSchema = z
  .object({
    id: productIdSchema.optional(),
    name: localizedTextSchema,
    category: z.string().trim().min(1).max(80),
    description: localizedTextSchema,
    price: z.number().finite().positive(),
    unit: z.enum(PRODUCT_UNITS),
    stock: z.number().int().min(0),
    lowStockThreshold: z.number().int().min(0).max(100_000).default(5),
    minOrderQty: z.number().int().positive(),
    harvestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    harvestInfo: z
      .object({
        district: z.string().trim().min(1).max(80),
        variety: z.string().trim().min(1).max(120),
      })
      .strict(),
    images: z.array(imageUrlSchema).max(5).default([]),
    status: z.enum(PRODUCT_STATUSES).default('draft'),
  })
  .strict();

export const updateProductSchema = createProductSchema
  .omit({ id: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const productIdParamSchema = z.object({ productId: productIdSchema }).strict();

export const productQuerySchema = z
  .object({
    status: z.enum(PRODUCT_STATUSES).optional(),
    search: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const stockAdjustmentSchema = z
  .object({
    quantity: z.number().int().min(0),
    reason: z.string().trim().min(3).max(200),
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
