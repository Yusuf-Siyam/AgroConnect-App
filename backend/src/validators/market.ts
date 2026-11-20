import { z } from 'zod';

import { MARKET_UNITS } from '../types/market';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const marketQuerySchema = z
  .object({
    crop: z.string().trim().min(1).max(80).optional(),
    district: z.string().trim().min(1).max(80).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'from must be before to',
  });

export const priceHistoryImportSchema = z
  .array(
    z
      .object({
        crop: z.string().trim().min(1),
        district: z.string().trim().min(1),
        date: dateSchema,
        price: z.number().finite().positive(),
        unit: z.enum(MARKET_UNITS),
        source: z.string().trim().min(1),
      })
      .strict(),
  )
  .min(1);

export type MarketQuery = z.infer<typeof marketQuerySchema>;
