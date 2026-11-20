export const PRODUCT_UNITS = ['kg', 'gram', 'mon', 'ton'] as const;
export const PRODUCT_STATUSES = ['draft', 'active', 'out_of_stock'] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export type LocalizedText = {
  bn: string;
  en: string;
};

export type ProductImage = {
  url: string;
  name?: string;
};

export type ProductHarvestInfo = {
  district: string;
  variety: string;
};

export type Product = {
  id: string;
  sellerId: string;
  name: LocalizedText;
  category: string;
  description: LocalizedText;
  price: number;
  unit: ProductUnit;
  stock: number;
  lowStockThreshold: number;
  minOrderQty: number;
  harvestDate: string;
  harvestInfo: ProductHarvestInfo;
  images: string[];
  status: ProductStatus;
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductListResponse = {
  items: Product[];
  total: number;
  limit: number;
  offset: number;
};

export type StockHistoryEntry = {
  id: string;
  productId: string;
  sellerId: string;
  actorId: string;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductStatsResponse = {
  total: number;
  draft: number;
  active: number;
  outOfStock: number;
  lowStock: number;
};
