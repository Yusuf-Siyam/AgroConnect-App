import { z } from 'zod';

import { PRODUCT_BATCH_STATUSES } from '../types/productBatch';
import { PRODUCT_UNITS } from '../types/product';
import { ISO_DATE_PATTERN, isCalendarDate } from '../utils/dates';

const dateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, 'Use YYYY-MM-DD')
  .refine(isCalendarDate, 'Use a real calendar date');

const idSchema = z.string().min(1).max(128);

export const createProductBatchSchema = z
  .object({
    productId: idSchema,
    harvestRecordId: idSchema.optional(),
    quantity: z.number().finite().positive().max(1_000_000),
    unit: z.enum(PRODUCT_UNITS),
    producedAt: dateSchema,
    expiresAt: dateSchema.optional(),
    status: z.enum(PRODUCT_BATCH_STATUSES).default('active'),
  })
  .strict();

export const updateProductBatchSchema = createProductBatchSchema
  .omit({ productId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const productBatchListQuerySchema = z
  .object({
    status: z.enum(PRODUCT_BATCH_STATUSES).optional(),
    productId: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const productBatchIdParamSchema = z
  .object({ batchId: z.string().min(1).max(128) })
  .strict();

export const traceProductBatchSchema = z
  .object({
    code: z.string().trim().min(16).max(128),
  })
  .strict();

export type CreateProductBatchInput = z.infer<typeof createProductBatchSchema>;
export type UpdateProductBatchInput = z.infer<typeof updateProductBatchSchema>;
export type ProductBatchListQuery = z.infer<typeof productBatchListQuerySchema>;
export type TraceProductBatchInput = z.infer<typeof traceProductBatchSchema>;
