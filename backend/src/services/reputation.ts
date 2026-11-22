import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { advancedFeatures } from '../config/advancedFeatures';
import { getFirebaseAdmin } from '../config/firebase';
import type { FarmerReputation, StoredFarmerReputation } from '../types/reputation';

type TimestampLike = { toDate?: () => Date };

const storedReputationSchema = z.object({
  farmerId: z.string(),
  score: z.number(),
  isNew: z.boolean(),
  reviewCount: z.number().int().min(0),
  deliveredCount: z.number().int().min(0),
  cancelledCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  breakdown: z.object({
    rating: z.object({
      weight: z.number(),
      componentScore: z.number(),
      averageRating: z.number(),
    }),
    delivered: z.object({
      weight: z.number(),
      componentScore: z.number(),
      deliveredCount: z.number().int().min(0),
      decisionCount: z.number().int().min(0),
    }),
    cancelReject: z.object({
      weight: z.number(),
      componentScore: z.number(),
      cancelledCount: z.number().int().min(0),
      rejectedCount: z.number().int().min(0),
      decisionCount: z.number().int().min(0),
    }),
  }),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  }
  return new Date(0).toISOString();
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export type ReputationCounts = {
  reviewCount: number;
  ratingTotal: number;
  deliveredCount: number;
  rejectedCount: number;
  cancelledCount: number;
};

/** Pure calculation used by the server and unit tests; no I/O. */
export function calculateReputationFromCounts(farmerId: string, counts: ReputationCounts): StoredFarmerReputation {
  const decisionCount = counts.deliveredCount + counts.rejectedCount + counts.cancelledCount;
  const averageRating = counts.reviewCount > 0 ? counts.ratingTotal / counts.reviewCount : 0;
  const ratingScore = counts.reviewCount > 0 ? (averageRating / 5) * 100 : 0;
  const deliveredScore = decisionCount > 0 ? (counts.deliveredCount / decisionCount) * 100 : 0;
  const cancelRejectScore =
    decisionCount > 0
      ? ((decisionCount - counts.rejectedCount - counts.cancelledCount) / decisionCount) * 100
      : 0;

  const weights = advancedFeatures.reputation.weights;
  const score = round(
    ratingScore * weights.rating + deliveredScore * weights.delivered + cancelRejectScore * weights.cancelReject,
  );

  return {
    farmerId,
    score,
    isNew: counts.reviewCount < advancedFeatures.reputation.minReviews,
    reviewCount: counts.reviewCount,
    deliveredCount: counts.deliveredCount,
    cancelledCount: counts.cancelledCount,
    rejectedCount: counts.rejectedCount,
    breakdown: {
      rating: {
        weight: weights.rating,
        componentScore: round(ratingScore),
        averageRating: round(averageRating),
      },
      delivered: {
        weight: weights.delivered,
        componentScore: round(deliveredScore),
        deliveredCount: counts.deliveredCount,
        decisionCount,
      },
      cancelReject: {
        weight: weights.cancelReject,
        componentScore: round(cancelRejectScore),
        cancelledCount: counts.cancelledCount,
        rejectedCount: counts.rejectedCount,
        decisionCount,
      },
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function reputationDoc(farmerId: string) {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('farmerReputation').doc(farmerId);
}

function maskScore(stored: StoredFarmerReputation): FarmerReputation {
  return {
    ...stored,
    score: stored.isNew ? null : stored.score,
  };
}

function serializeStored(data: unknown): StoredFarmerReputation {
  const raw = storedReputationSchema.parse(data);
  return {
    ...raw,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

function isFarmerResponsibleCancellation(statusHistory: unknown): boolean {
  if (!Array.isArray(statusHistory) || statusHistory.length === 0) return true;
  return statusHistory.some((event) => {
    if (!event || typeof event !== 'object') return false;
    const value = event as { to?: unknown; actorRole?: unknown };
    return value.to === 'cancelled' && value.actorRole !== 'buyer';
  });
}

/** Recounts every source document, so repeated calls produce the same score. */
export async function computeFarmerReputation(farmerId: string): Promise<StoredFarmerReputation> {
  const { firestore } = getFirebaseAdmin();
  const [reviewSnapshot, orderSnapshot] = await Promise.all([
    firestore.collection('reviews').where('sellerId', '==', farmerId).get(),
    firestore.collection('orders').where('sellerIds', 'array-contains', farmerId).get(),
  ]);

  let ratingTotal = 0;
  let reviewCount = 0;
  reviewSnapshot.forEach((document) => {
    const rating = document.get('rating');
    if (typeof rating === 'number' && Number.isFinite(rating)) {
      ratingTotal += rating;
      reviewCount += 1;
    }
  });

  let deliveredCount = 0;
  let rejectedCount = 0;
  let cancelledCount = 0;
  orderSnapshot.forEach((document) => {
    const status = document.get('status');
    if (status === 'delivered') deliveredCount += 1;
    if (status === 'rejected') rejectedCount += 1;
    if (status === 'cancelled' && isFarmerResponsibleCancellation(document.get('statusHistory'))) {
      cancelledCount += 1;
    }
  });

  return calculateReputationFromCounts(farmerId, {
    reviewCount,
    ratingTotal,
    deliveredCount,
    rejectedCount,
    cancelledCount,
  });
}

export async function recomputeFarmerReputation(farmerId: string): Promise<StoredFarmerReputation> {
  const computed = await computeFarmerReputation(farmerId);
  const ref = reputationDoc(farmerId);
  const existing = await ref.get();

  await ref.set({
    ...computed,
    createdAt: existing.exists ? existing.get('createdAt') : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return serializeStored((await ref.get()).data());
}

/** Never allow a reputation side effect to fail a review or order action. */
export async function safeRecomputeFarmerReputation(farmerId: string): Promise<void> {
  try {
    await recomputeFarmerReputation(farmerId);
  } catch (error) {
    console.error('[reputation] recompute hook failed (non-fatal)', error);
  }
}

export async function recomputeFarmerReputationsForOrder(order: {
  sellerIds?: string[];
  items?: { sellerId: string }[];
}): Promise<void> {
  const sellerIds = order.sellerIds?.length
    ? order.sellerIds
    : (order.items ?? []).map((item) => item.sellerId);
  const unique = [...new Set(sellerIds.filter(Boolean))];
  await Promise.all(unique.map((sellerId) => safeRecomputeFarmerReputation(sellerId)));
}

export async function getFarmerReputation(farmerId: string): Promise<FarmerReputation> {
  const snapshot = await reputationDoc(farmerId).get();
  if (!snapshot.exists) {
    const computed = await recomputeFarmerReputation(farmerId);
    return maskScore(computed);
  }
  return maskScore(serializeStored(snapshot.data()));
}

export async function listFarmerIds(): Promise<string[]> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await firestore.collection('users').where('role', '==', 'farmer').get();
  return snapshot.docs.map((document) => document.id);
}

export async function recomputeAllFarmerReputations(): Promise<number> {
  const farmerIds = await listFarmerIds();
  await Promise.all(farmerIds.map((farmerId) => recomputeFarmerReputation(farmerId)));
  return farmerIds.length;
}
