import { z } from 'zod';

import { advancedFeatures } from '../config/advancedFeatures';
import { GROUP_PURCHASE_STATUSES } from '../types/groupPurchase';

const idSchema = z.string().trim().min(1).max(128);

export const createGroupPurchaseSchema = z
  .object({
    productId: idSchema,
    targetQuantity: z.number().int().positive().max(1_000_000),
    quantityPerParticipant: z.number().int().positive().max(100_000),
    discountPercent: z
      .number()
      .int()
      .min(advancedFeatures.group.minDiscountPercent)
      .max(advancedFeatures.group.maxDiscountPercent),
    maxParticipants: z
      .number()
      .int()
      .min(2)
      .max(advancedFeatures.group.maxParticipants),
    deadlineInDays: z
      .number()
      .int()
      .min(1)
      .max(advancedFeatures.group.maxDurationDays),
  })
  .strict()
  .refine((v) => v.targetQuantity <= v.quantityPerParticipant * v.maxParticipants, {
    message: 'targetQuantity cannot exceed quantityPerParticipant * maxParticipants',
    path: ['targetQuantity'],
  });

export const groupPurchaseQuerySchema = z
  .object({
    status: z.enum(GROUP_PURCHASE_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const groupPurchaseIdParamSchema = z.object({ groupId: idSchema }).strict();

export const joinGroupPurchaseSchema = z
  .object({
    quantity: z.number().int().positive().max(100_000).optional(),
  })
  .strict();

export type CreateGroupPurchaseInput = z.infer<typeof createGroupPurchaseSchema>;
export type GroupPurchaseQuery = z.infer<typeof groupPurchaseQuerySchema>;
export type JoinGroupPurchaseInput = z.infer<typeof joinGroupPurchaseSchema>;
