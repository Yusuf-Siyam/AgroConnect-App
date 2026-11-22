import type { ProductUnit } from './types';

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

export type ProductBatchList = {
  items: ProductBatch[];
  total: number;
  limit: number;
  offset: number;
};
