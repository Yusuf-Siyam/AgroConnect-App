import type { FarmerReputation } from '../buyer/reputation';
import type { OrderStatus } from '../orders/types';

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
  reputation?: FarmerReputation;
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

export { ORDER_STATUSES } from '../orders/types';
export type {
  DeliveryAddress,
  Order,
  OrderCheckout,
  OrderItem,
  OrderList,
  OrderStatus,
  OrderStatusEvent,
} from '../orders/types';

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
