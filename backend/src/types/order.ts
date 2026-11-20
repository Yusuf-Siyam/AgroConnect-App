import type { OrderStatus } from '../services/orderStatus';

export { ORDER_STATUSES, PAID_OR_LATER_STATUSES } from '../services/orderStatus';
export type { OrderStatus, OrderTransitionActor } from '../services/orderStatus';

export type OrderItem = {
  productId: string;
  sellerId: string;
  name: { bn?: string; en?: string };
  quantity: number;
  unitPrice: number;
  unit: string;
};

export type DeliveryAddress = {
  addressLine: string;
  district: string;
  phoneNumber: string;
};

export type OrderStatusEvent = {
  id: string;
  from: OrderStatus | null;
  to: OrderStatus;
  actorId: string;
  actorRole: string;
  reason?: string;
  stockAdjusted?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Order = {
  id: string;
  buyerId: string;
  sellerIds: string[];
  items: OrderItem[];
  status: OrderStatus;
  totalAmount: number;
  deliveryFee: number | null;
  deliveryAddress?: DeliveryAddress;
  rejectionReason?: string;
  stockAdjusted?: boolean;
  stockRestored?: boolean;
  statusHistory: OrderStatusEvent[];
  createdAt: string;
  updatedAt: string;
};

export type OrderListResponse = {
  items: Order[];
  total: number;
  limit: number;
  offset: number;
};

export type OrderCheckoutResponse = {
  checkoutId: string;
  orders: Order[];
  orderIds: string[];
  farmerCount: number;
  itemCount: number;
  totalAmount: number;
  deliveryFee: null;
};
