import { z } from 'zod';

import { ORDER_STATUSES } from '../services/orderStatus';

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

export const createOrderSchema = z
  .object({
    checkoutId: z.string().uuid(),
    deliveryAddress: z
      .object({
        addressLine: z.string().trim().min(10).max(300),
        district: z.string().trim().min(2).max(100),
        phoneNumber: z.string().trim().regex(/^\+?[0-9]{7,15}$/),
      })
      .strict(),
  })
  .strict();

export const cancelOrderSchema = z
  .object({
    reason: z.string().trim().min(3).max(200).optional(),
  })
  .strict();

export type OrderQuery = z.infer<typeof orderQuerySchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
