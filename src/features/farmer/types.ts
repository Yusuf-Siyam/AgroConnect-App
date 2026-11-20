export const PRODUCT_UNITS = ['kg', 'gram', 'mon', 'ton'] as const;
export const PRODUCT_STATUSES = ['draft', 'active', 'out_of_stock'] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export type LocalizedText = { bn: string; en: string };

export type RatingSummary = { average: number; count: number };

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
  ratingSummary?: RatingSummary;
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

export const ORDER_STATUSES = [
  'pending',
  'accepted',
  'paid',
  'shipment_accepted',
  'collected',
  'shipped',
  'delivered',
  'rejected',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderItem = {
  productId: string;
  sellerId: string;
  name: { bn?: string; en?: string };
  quantity: number;
  unitPrice: number;
  unit: string;
};

export type Order = {
  id: string;
  buyerId: string;
  sellerIds: string[];
  items: OrderItem[];
  status: OrderStatus;
  totalAmount: number;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderList = {
  items: Order[];
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

export type StockAdjustment = {
  quantity: number;
  reason: string;
};

export type StatusCounts = Record<OrderStatus, number>;

export type AnalyticsSummary = {
  statusCounts: StatusCounts;
  revenue: number;
  paidOrders: number;
  topProducts: {
    productId: string;
    name: string;
    quantity: number;
    revenue: number;
  }[];
  last7Days: { orders: number; revenue: number };
  last30Days: { orders: number; revenue: number };
  generatedAt: string;
};

export type WeatherCurrent = {
  temperature: number;
  humidity: number | null;
  windSpeed: number | null;
  weatherCode: number;
  time: string;
};

export type WeatherDay = {
  date: string;
  weatherCode: number;
  maxTemperature: number;
  minTemperature: number;
};

export type Weather = {
  latitude: number;
  longitude: number;
  locationLabel: string;
  locationSource: 'gps' | 'district';
  current: WeatherCurrent;
  daily: WeatherDay[];
  fetchedAt: string;
};

export const MARKET_UNITS = ['kg', 'mon', 'ton'] as const;
export type MarketUnit = (typeof MARKET_UNITS)[number];

export type PricePoint = {
  id: string;
  crop: string;
  district: string;
  date: string;
  price: number;
  unit: MarketUnit;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type PriceHistory = {
  items: PricePoint[];
  total: number;
  limit: number;
  offset: number;
};
