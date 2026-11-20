import { api, assertApiConfigured, toApiError } from '@/services/api';

import { parseOrder, parseOrderCheckout, parseOrderList } from '../orders/schema';
import type {
  DeliveryAddress,
  Order,
  OrderCheckout,
  OrderList,
  OrderStatus,
} from '../orders/types';

export type CreateOrderInput = {
  checkoutId: string;
  deliveryAddress: DeliveryAddress;
};

export async function createOrderCheckout(input: CreateOrderInput): Promise<OrderCheckout> {
  assertApiConfigured();
  try {
    const response = await api.post('/api/orders', input);
    return parseOrderCheckout(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listBuyerOrders(params: {
  status?: OrderStatus;
  limit?: number;
  offset?: number;
}): Promise<OrderList> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/orders/mine', { params });
    return parseOrderList(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getBuyerOrder(orderId: string): Promise<Order> {
  assertApiConfigured();
  try {
    const response = await api.get(`/api/orders/${orderId}`);
    return parseOrder(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function cancelBuyerOrder(orderId: string, reason?: string): Promise<Order> {
  assertApiConfigured();
  try {
    const response = await api.post(`/api/orders/${orderId}/cancel`, reason ? { reason } : {});
    return parseOrder(response.data);
  } catch (error) {
    throw toApiError(error);
  }
}
