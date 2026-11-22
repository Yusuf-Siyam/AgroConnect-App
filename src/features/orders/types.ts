export const ORDER_STATUSES = [
  'pending',
  'accepted',
  'paid',
  'shipment_accepted',
  'collected',
  'shipped',
  'delivered',
  'rejected',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderItem = {
  productId: string;
  sellerId: string;
  name: { bn?: string; en?: string };
  quantity: number;
  unitPrice: number;
  baseUnitPrice: number;
  emergencyListingId?: string;
  discountPercent?: number;
  priceSource: 'base' | 'emergency' | 'group';
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
  cancellationReason?: string;
  stockAdjusted?: boolean;
  stockRestored?: boolean;
  statusHistory: OrderStatusEvent[];
  createdAt: string;
  updatedAt: string;
};

export type OrderList = {
  items: Order[];
  total: number;
  limit: number;
  offset: number;
};

export type OrderCheckout = {
  checkoutId: string;
  orders: Order[];
  orderIds: string[];
  farmerCount: number;
  itemCount: number;
  totalAmount: number;
  deliveryFee: number | null;
};
