import { z } from 'zod';

import { advancedFeatures } from '../config/advancedFeatures';
import { EMERGENCY_LISTING_STATUSES } from '../types/emergencyListing';

const idSchema = z.string().trim().min(1).max(128);

export const createEmergencyListingSchema = z
  .object({
    productId: idSchema,
    discountPercent: z
      .number()
      .int()
      .min(advancedFeatures.emergency.minDiscountPercent)
      .max(advancedFeatures.emergency.maxDiscountPercent),
    availableQty: z.number().int().positive().max(1_000_000),
    expiresInHours: z
      .number()
      .int()
      .min(1)
      .max(advancedFeatures.emergency.maxDurationHours),
  })
  .strict();

export const updateEmergencyListingSchema = z
  .object({
    discountPercent: z
      .number()
      .int()
      .min(advancedFeatures.emergency.minDiscountPercent)
      .max(advancedFeatures.emergency.maxDiscountPercent)
      .optional(),
    availableQty: z.number().int().positive().max(1_000_000).optional(),
    expiresInHours: z
      .number()
      .int()
      .min(1)
      .max(advancedFeatures.emergency.maxDurationHours)
      .optional(),
    status: z.enum(['cancelled'] as const).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const emergencyListingQuerySchema = z
  .object({
    status: z.enum(EMERGENCY_LISTING_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const emergencyListingIdParamSchema = z.object({ listingId: idSchema }).strict();

export type CreateEmergencyListingInput = z.infer<typeof createEmergencyListingSchema>;
export type UpdateEmergencyListingInput = z.infer<typeof updateEmergencyListingSchema>;
export type EmergencyListingQuery = z.infer<typeof emergencyListingQuerySchema>;
