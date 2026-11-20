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

export type PriceHistoryResponse = {
  items: PricePoint[];
  total: number;
  limit: number;
  offset: number;
};
