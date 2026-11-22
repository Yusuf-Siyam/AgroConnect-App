import type { Product } from './product';

export type CartItem = {
  productId: string;
  sellerId: string;
  name: Product['name'];
  imageUrl?: string;
  unit: Product['unit'];
  quantity: number;
  minOrderQty: number;
  stock: number;
  /** Always recomputed from the current product, never from a stored snapshot. */
  unitPrice: number;
  baseUnitPrice: number;
  emergencyListingId?: string;
  discountPercent?: number;
  priceSource: 'base' | 'emergency';
  lineTotal: number;
  available: boolean;
  unavailableReason?: 'PRODUCT_NOT_FOUND' | 'PRODUCT_UNAVAILABLE' | 'OWN_PRODUCT';
};

export type CartResponse = {
  items: CartItem[];
  total: number;
  farmerCount: number;
  updatedAt?: string;
};

export type WishlistResponse = {
  items: Product[];
  total: number;
  limit: number;
  offset: number;
};

export type Review = {
  id: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  rating: number;
  text?: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewListResponse = {
  items: Review[];
  total: number;
  limit: number;
  offset: number;
};

export type ReviewEligibility = {
  eligible: boolean;
  hasReviewed: boolean;
  reason?: 'NOT_DELIVERED' | 'NO_DELIVERED_PRODUCT' | 'ALREADY_REVIEWED';
};
