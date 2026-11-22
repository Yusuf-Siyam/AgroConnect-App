import type { ProductUnit } from '@/features/farmer/types';

export type ProductBatchTrace = {
  code: string;
  productName: { bn: string; en: string };
  crop: string;
  farmerDisplayName: string;
  district: string;
  producedAt: string;
  harvestDate?: string;
  quantity: number;
  unit: ProductUnit;
  status: 'active' | 'inactive';
};
