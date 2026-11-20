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
