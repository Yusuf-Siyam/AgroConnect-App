import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

import { ORDER_STATUSES, type Order, type OrderList, type OrderStatus } from './types';

const orderItemSchema = z.object({
  productId: z.string(),
  sellerId: z.string(),
  name: z.object({ bn: z.string().optional(), en: z.string().optional() }),
  quantity: z.number().int(),
  unitPrice: z.number(),
  unit: z.string(),
});

const orderSchema = z.object({
  id: z.string(),
  buyerId: z.string(),
  sellerIds: z.array(z.string()),
  items: z.array(orderItemSchema),
  status: z.enum(ORDER_STATUSES),
  totalAmount: z.number(),
  rejectionReason: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const orderListSchema = z.object({
  items: z.array(orderSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  }
  return result.data;
}

export async function listFarmerOrders(params: {
  status?: OrderStatus;
  limit?: number;
  offset?: number;
}): Promise<OrderList> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/orders', { params });
    return parseOrThrow(orderListSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getFarmerOrder(orderId: string): Promise<Order> {
  assertApiConfigured();
  try {
    const response = await api.get(`/api/orders/${orderId}`);
    return parseOrThrow(orderSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function acceptFarmerOrder(orderId: string): Promise<Order> {
  assertApiConfigured();
  try {
    const response = await api.post(`/api/orders/${orderId}/accept`);
    return parseOrThrow(orderSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function rejectFarmerOrder(orderId: string, reason: string): Promise<Order> {
  assertApiConfigured();
  try {
    const response = await api.post(`/api/orders/${orderId}/reject`, { reason });
    return parseOrThrow(orderSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}
