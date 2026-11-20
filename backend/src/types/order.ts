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
  unit: string;
};

export type Order = {
  id: string;
  buyerId: string;
  sellerIds: string[];
  items: OrderItem[];
  status: OrderStatus;
  totalAmount: number;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderListResponse = {
  items: Order[];
  total: number;
  limit: number;
  offset: number;
};

export const PAID_OR_LATER_STATUSES: OrderStatus[] = [
  'paid',
  'shipment_accepted',
  'collected',
  'shipped',
  'delivered',
];
