import type { FarmerReputation } from './reputation';
import type { Product, ProductList, ProductUnit, RatingSummary } from '@/features/farmer/types';

export type { Product, ProductList, ProductUnit, RatingSummary };

export type Category = {
  id: string;
  name: { bn: string; en: string };
};

export type CategoryList = { items: Category[] };

export type FarmerProfile = {
  id: string;
  displayName: string;
  district?: string;
  photoURL?: string;
  ratingSummary: RatingSummary;
  productCount: number;
  reputation: FarmerReputation;
};

export type MarketplaceSort = 'newest' | 'price_asc' | 'price_desc';

export type MarketplaceFilters = {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  district?: string;
  unit?: ProductUnit;
  inStock?: boolean;
  sort: MarketplaceSort;
  limit: number;
  offset: number;
};

export const DEFAULT_MARKETPLACE_FILTERS: Omit<MarketplaceFilters, 'offset'> = {
  sort: 'newest',
  limit: 10,
};

export type { ProductList as MarketplaceList };

export type CartItem = {
  productId: string;
  sellerId: string;
  name: { bn: string; en: string };
  imageUrl?: string;
  unit: ProductUnit;
  quantity: number;
  minOrderQty: number;
  stock: number;
  unitPrice: number;
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

export type ReviewList = {
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
