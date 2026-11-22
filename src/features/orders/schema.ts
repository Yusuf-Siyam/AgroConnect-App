import { z } from 'zod';

import {
  ORDER_STATUSES,
  type Order,
  type OrderCheckout,
  type OrderList,
} from './types';

const orderItemSchema = z.object({
  productId: z.string(),
  sellerId: z.string(),
  name: z.object({ bn: z.string().optional(), en: z.string().optional() }),
  quantity: z.number().int(),
  unitPrice: z.number(),
  baseUnitPrice: z.number().default(0),
  emergencyListingId: z.string().optional(),
  discountPercent: z.number().optional(),
  priceSource: z.enum(['base', 'emergency']).default('base'),
  unit: z.string(),
});

const deliveryAddressSchema = z.object({
  addressLine: z.string(),
  district: z.string(),
  phoneNumber: z.string(),
});

const statusEventSchema = z.object({
  id: z.string(),
  from: z.enum(ORDER_STATUSES).nullable(),
  to: z.enum(ORDER_STATUSES),
  actorId: z.string(),
  actorRole: z.string(),
  reason: z.string().optional(),
  stockAdjusted: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const orderSchema: z.ZodType<Order> = z
  .object({
    id: z.string(),
    buyerId: z.string(),
    sellerIds: z.array(z.string()),
    items: z.array(orderItemSchema),
    status: z.enum(ORDER_STATUSES),
    totalAmount: z.number(),
    deliveryFee: z.number().nullable(),
    deliveryAddress: deliveryAddressSchema.optional(),
    rejectionReason: z.string().optional(),
    cancellationReason: z.string().optional(),
    stockAdjusted: z.boolean().optional(),
    stockRestored: z.boolean().optional(),
    statusHistory: z.array(statusEventSchema).default([]),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

export const orderListSchema: z.ZodType<OrderList> = z.object({
  items: z.array(orderSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const orderCheckoutSchema: z.ZodType<OrderCheckout> = z.object({
  checkoutId: z.string(),
  orders: z.array(orderSchema),
  orderIds: z.array(z.string()),
  farmerCount: z.number().int(),
  itemCount: z.number().int(),
  totalAmount: z.number(),
  deliveryFee: z.number().nullable(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  }
  return result.data;
}

export function parseOrder(data: unknown): Order {
  return parseOrThrow(orderSchema, data);
}

export function parseOrderList(data: unknown): OrderList {
  return parseOrThrow(orderListSchema, data);
}

export function parseOrderCheckout(data: unknown): OrderCheckout {
  return parseOrThrow(orderCheckoutSchema, data);
}
