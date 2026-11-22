import type { ProductUnit } from './product';

export const HARVEST_STATUSES = ['planned', 'growing', 'ready', 'harvested'] as const;

export type HarvestStatus = (typeof HARVEST_STATUSES)[number];

export type HarvestRecord = {
  id: string;
  farmerId: string;
  crop: string;
  productId?: string;
  plot?: string;
  sowingDate: string;
  expectedHarvestDate: string;
  actualHarvestDate?: string;
  expectedQuantity: number;
  unit: ProductUnit;
  status: HarvestStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type HarvestRecordListResponse = {
  items: HarvestRecord[];
  total: number;
  limit: number;
  offset: number;
};
