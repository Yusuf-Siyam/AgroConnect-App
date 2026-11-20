import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { MARKET_UNITS, type PriceHistoryResponse, type PricePoint } from '../types/market';
import type { MarketQuery } from '../validators/market';

type TimestampLike = { toDate?: () => Date };

const storedPriceSchema = z.object({
  id: z.string().min(1),
  crop: z.string().min(1),
  district: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  price: z.number().finite().positive(),
  unit: z.enum(MARKET_UNITS),
  source: z.string().min(1),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  }
  return new Date().toISOString();
}

function priceHistoryCollection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('priceHistory');
}

function serializePrice(data: unknown): PricePoint | null {
  const parsed = storedPriceSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    createdAt: toIsoString(parsed.data.createdAt),
    updatedAt: toIsoString(parsed.data.updatedAt),
  };
}

export async function listPriceHistory(query: MarketQuery): Promise<PriceHistoryResponse> {
  let firestoreQuery = priceHistoryCollection().orderBy('date', 'desc');
  if (query.crop) firestoreQuery = firestoreQuery.where('crop', '==', query.crop);
  if (query.district) firestoreQuery = firestoreQuery.where('district', '==', query.district);
  if (query.from) firestoreQuery = firestoreQuery.where('date', '>=', query.from);
  if (query.to) firestoreQuery = firestoreQuery.where('date', '<=', query.to);

  const snapshot = await firestoreQuery.get();
  const items = snapshot.docs
    .map((document) => serializePrice({ ...document.data(), id: document.id }))
    .filter((item): item is PricePoint => item !== null);

  return {
    items: items.slice(query.offset, query.offset + query.limit),
    total: items.length,
    limit: query.limit,
    offset: query.offset,
  };
}
