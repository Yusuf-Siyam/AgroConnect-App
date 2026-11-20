import { z } from 'zod';

import { ORDER_STATUSES } from '../types/order';

export const orderIdParamSchema = z.object({ orderId: z.string().min(1) }).strict();

export const orderQuerySchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const rejectOrderSchema = z
  .object({
    reason: z.string().trim().min(3, 'Reject reason is required').max(200),
  })
  .strict();

export type OrderQuery = z.infer<typeof orderQuerySchema>;
