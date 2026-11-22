import { z } from 'zod';

import { HARVEST_STATUSES } from '../types/harvestRecord';
import { PRODUCT_UNITS } from '../types/product';
import { ISO_DATE_PATTERN, isCalendarDate } from '../utils/dates';

const dateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, 'Use YYYY-MM-DD')
  .refine(isCalendarDate, 'Use a real calendar date');

const productIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Invalid product id');

export const createHarvestRecordSchema = z
  .object({
    crop: z.string().trim().min(1).max(120),
    productId: productIdSchema.optional(),
    plot: z.string().trim().min(1).max(120).optional(),
    sowingDate: dateSchema,
    expectedHarvestDate: dateSchema,
    actualHarvestDate: dateSchema.optional(),
    expectedQuantity: z.number().finite().positive().max(1_000_000),
    unit: z.enum(PRODUCT_UNITS),
    status: z.enum(HARVEST_STATUSES).default('planned'),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateHarvestRecordSchema = createHarvestRecordSchema
  .omit({ status: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const harvestStatusSchema = z
  .object({
    status: z.enum(HARVEST_STATUSES),
    actualHarvestDate: dateSchema.optional(),
  })
  .strict();

export const harvestRecordListQuerySchema = z
  .object({
    status: z.enum(HARVEST_STATUSES).optional(),
    crop: z.string().trim().max(120).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const harvestRecordIdParamSchema = z
  .object({ recordId: z.string().min(1).max(120) })
  .strict();

export type CreateHarvestRecordInput = z.infer<typeof createHarvestRecordSchema>;
export type UpdateHarvestRecordInput = z.infer<typeof updateHarvestRecordSchema>;
export type HarvestStatusInput = z.infer<typeof harvestStatusSchema>;
export type HarvestRecordListQuery = z.infer<typeof harvestRecordListQuerySchema>;
