import { z } from 'zod';

import { CATEGORY_IDS } from '../constants/categories';
import { PRODUCT_UNITS } from '../types/product';

export const marketplaceQuerySchema = z
  .object({
    search: z.string().trim().max(80).optional(),
    category: z.enum(CATEGORY_IDS as [string, ...string[]]).optional(),
    minPrice: z.coerce.number().finite().nonnegative().optional(),
    maxPrice: z.coerce.number().finite().nonnegative().optional(),
    district: z.string().trim().max(80).optional(),
    unit: z.enum(PRODUCT_UNITS).optional(),
    inStock: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()
  .refine(
    (value) => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice,
    'minPrice must be less than or equal to maxPrice',
  );

export const farmerIdParamSchema = z
  .object({ farmerId: z.string().trim().min(1).max(128) })
  .strict();

export type MarketplaceQuery = z.infer<typeof marketplaceQuerySchema>;
