import type { ProductUnit } from './product';
import type { FarmerReputation } from './reputation';

export const PRODUCT_BATCH_STATUSES = ['active', 'inactive'] as const;
export type ProductBatchStatus = (typeof PRODUCT_BATCH_STATUSES)[number];

export type ProductBatch = {
  id: string;
  code: string;
  productId: string;
  farmerId: string;
  harvestRecordId?: string;
  quantity: number;
  unit: ProductUnit;
  producedAt: string;
  expiresAt?: string;
  status: ProductBatchStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProductBatchListResponse = {
  items: ProductBatch[];
  total: number;
  limit: number;
  offset: number;
};

/** Public trace response — never includes contact details, internal ids, notes, or stock/cost. */
export type ProductBatchTraceResponse = {
  code: string;
  productName: { bn: string; en: string };
  crop: string;
  farmerDisplayName: string;
  district: string;
  producedAt: string;
  harvestDate?: string;
  quantity: number;
  unit: ProductUnit;
  status: ProductBatchStatus;
  reputation: Pick<FarmerReputation, 'score' | 'isNew' | 'reviewCount'>;
};
