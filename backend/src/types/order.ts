import type { OrderStatus } from '../services/orderStatus';

export { ORDER_STATUSES, PAID_OR_LATER_STATUSES } from '../services/orderStatus';
export type { OrderStatus, OrderTransitionActor } from '../services/orderStatus';

export type OrderItem = {
  productId: string;
  sellerId: string;
  name: { bn?: string; en?: string };
  quantity: number;
  unitPrice: number;
  baseUnitPrice: number;
  emergencyListingId?: string;
  discountPercent?: number;
  priceSource: 'base' | 'emergency';
  unit: string;
};

export type DeliveryAddress = {
  addressLine: string;
  district: string;
  phoneNumber: string;
  /** Optional Phase 08 capture; required for distance-based pricing. */
  latitude?: number;
  longitude?: number;
};

/** Optional Phase 08 capture. Phase 07B will populate it from trusted seller data. */
export type PickupAddress = {
  addressLine?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
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
  transporterId?: string;
  items: OrderItem[];
  status: OrderStatus;
  totalAmount: number;
  deliveryFee: number | null;
  pickupAddress?: PickupAddress;
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
