import { api, assertApiConfigured, toApiError } from '@/services/api';

import { parseOrder, parseOrderList } from '../orders/schema';
import type { Order, OrderList, OrderStatus } from './types';

export async function listFarmerOrders(params: {
  status?: OrderStatus;
  limit?: number;
  offset?: number;
}): Promise<OrderList> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/orders', { params });
    return parseOrderList(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getFarmerOrder(orderId: string): Promise<Order> {
  assertApiConfigured();
  try {
    const response = await api.get(`/api/orders/${orderId}`);
    return parseOrder(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function acceptFarmerOrder(orderId: string): Promise<Order> {
  assertApiConfigured();
  try {
    const response = await api.post(`/api/orders/${orderId}/accept`);
    return parseOrder(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function rejectFarmerOrder(orderId: string, reason: string): Promise<Order> {
  assertApiConfigured();
  try {
    const response = await api.post(`/api/orders/${orderId}/reject`, { reason });
    return parseOrder(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}
