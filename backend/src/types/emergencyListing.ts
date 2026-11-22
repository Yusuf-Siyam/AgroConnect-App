import type { ProductUnit } from './product';

export const EMERGENCY_LISTING_STATUSES = ['active', 'expired', 'cancelled', 'sold_out'] as const;
export type EmergencyListingStatus = (typeof EMERGENCY_LISTING_STATUSES)[number];

export type EmergencyListing = {
  id: string;
  farmerId: string;
  productId: string;
  originalPrice: number;
  discountPercent: number;
  discountedPrice: number;
  unit: ProductUnit;
  availableQty: number;
  soldQty: number;
  expiresAt: string;
  status: EmergencyListingStatus;
  createdAt: string;
  updatedAt: string;
};

export type EmergencyListingListResponse = {
  items: EmergencyListing[];
  total: number;
  limit: number;
  offset: number;
};

export type PublicEmergencyListing = EmergencyListing & {
  productName: { bn: string; en: string };
  productImages: string[];
  farmerDisplayName: string;
  district: string;
};
