export const PRODUCT_UNITS = ['kg', 'gram', 'mon', 'ton'] as const;
export const PRODUCT_STATUSES = ['draft', 'active', 'out_of_stock'] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export type LocalizedText = { bn: string; en: string };

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
  harvestInfo: { district: string; variety: string };
  images: string[];
  status: ProductStatus;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductList = {
  items: Product[];
  total: number;
  limit: number;
  offset: number;
};

export type ProductStats = {
  total: number;
  draft: number;
  active: number;
  outOfStock: number;
  lowStock: number;
};

/** 1 mon (maund) = 40 kg. Flagged in README for product-owner confirmation. */
export const MAUND_TO_KG = 40;
