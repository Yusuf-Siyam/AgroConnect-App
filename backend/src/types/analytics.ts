import type { OrderStatus } from './order';

export type AnalyticsPeriod = {
  orders: number;
  revenue: number;
};

export type TopProduct = {
  productId: string;
  name: string;
  quantity: number;
  revenue: number;
};

export type AnalyticsSummary = {
  statusCounts: Record<OrderStatus, number>;
  revenue: number;
  paidOrders: number;
  topProducts: TopProduct[];
  last7Days: AnalyticsPeriod;
  last30Days: AnalyticsPeriod;
  generatedAt: string;
};
