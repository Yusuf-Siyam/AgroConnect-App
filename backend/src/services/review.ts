import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import type {
  Review,
  ReviewEligibility,
  ReviewListResponse,
} from '../types/buyerState';
import type { CreateReviewInput, ReviewQuery } from '../validators/buyerState';
import { parseStoredProduct } from './product';
import { safeRecomputeFarmerReputation } from './reputation';

const storedReviewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  buyerId: z.string(),
  sellerId: z.string(),
  rating: z.number().int().min(1).max(5),
  text: z.string().optional(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

function reviewId(buyerId: string, productId: string): string {
  return `${buyerId}_${productId}`;
}

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as { toDate?: () => Date };
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  }
  return '';
}

function serializeReview(data: unknown): Review {
  const parsed = storedReviewSchema.parse(data);
  const review: Review = {
    id: parsed.id,
    productId: parsed.productId,
    buyerId: parsed.buyerId,
    sellerId: parsed.sellerId,
    rating: parsed.rating,
    createdAt: toIsoString(parsed.createdAt),
    updatedAt: toIsoString(parsed.updatedAt),
  };
  if (parsed.text) review.text = parsed.text;
  return review;
}

async function hasDeliveredOrder(buyerId: string, productId: string): Promise<boolean> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await firestore
    .collection('orders')
    .where('buyerId', '==', buyerId)
    .where('status', '==', 'delivered')
    .get();

  return snapshot.docs.some((document) => {
    const items = document.get('items');
    return Array.isArray(items) && items.some((item) => item?.productId === productId);
  });
}

export async function getReviewEligibility(
  buyerId: string,
  productId: string,
): Promise<ReviewEligibility> {
  const { firestore } = getFirebaseAdmin();
  const reviewSnapshot = await firestore.collection('reviews').doc(reviewId(buyerId, productId)).get();
  if (reviewSnapshot.exists) {
    return { eligible: false, hasReviewed: true, reason: 'ALREADY_REVIEWED' };
  }

  const delivered = await hasDeliveredOrder(buyerId, productId);
  if (!delivered) {
    return { eligible: false, hasReviewed: false, reason: 'NO_DELIVERED_PRODUCT' };
  }
  return { eligible: true, hasReviewed: false };
}

export async function listReviews(productId: string, query: ReviewQuery): Promise<ReviewListResponse> {
  const { firestore } = getFirebaseAdmin();
  const base = firestore.collection('reviews').where('productId', '==', productId);
  const [all, page] = await Promise.all([
    base.get(),
    base.orderBy('createdAt', 'desc').limit(query.limit).offset(query.offset).get(),
  ]);

  return {
    items: page.docs.map((document) => serializeReview(document.data())),
    total: all.size,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function createReview(buyerId: string, input: CreateReviewInput): Promise<Review> {
  const { firestore } = getFirebaseAdmin();
  const eligibility = await getReviewEligibility(buyerId, input.productId);
  if (eligibility.hasReviewed) {
    throw new HttpError(409, 'REVIEW_DUPLICATE', 'You have already reviewed this product.');
  }
  if (!eligibility.eligible) {
    throw new HttpError(
      403,
      'REVIEW_NOT_ELIGIBLE',
      'Only buyers with a delivered order containing this product can review it.',
    );
  }

  const reviewRef = firestore.collection('reviews').doc(reviewId(buyerId, input.productId));
  const productRef = firestore.collection('products').doc(input.productId);
  let sellerId = '';

  await firestore.runTransaction(async (transaction) => {
    const [existingReview, productSnapshot] = await Promise.all([
      transaction.get(reviewRef),
      transaction.get(productRef),
    ]);
    if (existingReview.exists) {
      throw new HttpError(409, 'REVIEW_DUPLICATE', 'You have already reviewed this product.');
    }
    if (!productSnapshot.exists || productSnapshot.get('deleted') === true) {
      throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    }

    const product = parseStoredProduct(productSnapshot.data());
    sellerId = product.sellerId;
    const farmerRef = firestore.collection('users').doc(product.sellerId);
    const farmerSnapshot = await transaction.get(farmerRef);
    if (!farmerSnapshot.exists) {
      throw new HttpError(404, 'FARMER_NOT_FOUND', 'Farmer profile not found.');
    }

    const previous = product.ratingSummary;
    const productSummary = {
      average:
        Math.round(((previous.average * previous.count + input.rating) / (previous.count + 1)) * 10) / 10,
      count: previous.count + 1,
    };

    const sellerReviews = await transaction.get(
      firestore.collection('reviews').where('sellerId', '==', product.sellerId),
    );
    let farmerRatingTotal = input.rating;
    let farmerRatingCount = 1;
    sellerReviews.forEach((document) => {
      const rating = document.get('rating');
      if (typeof rating === 'number' && Number.isFinite(rating)) {
        farmerRatingTotal += rating;
        farmerRatingCount += 1;
      }
    });
    const farmerSummary = {
      average: Math.round((farmerRatingTotal / farmerRatingCount) * 10) / 10,
      count: farmerRatingCount,
    };

    const now = FieldValue.serverTimestamp();
    const review: Review = {
      id: reviewRef.id,
      productId: input.productId,
      buyerId,
      sellerId: product.sellerId,
      rating: input.rating,
      createdAt: '',
      updatedAt: '',
      ...(input.text ? { text: input.text } : {}),
    };

    transaction.set(reviewRef, { ...review, createdAt: now, updatedAt: now });
    transaction.update(productRef, { ratingSummary: productSummary, updatedAt: now });
    transaction.update(farmerRef, { ratingSummary: farmerSummary, updatedAt: now });
  });

  const saved = await reviewRef.get();
  await safeRecomputeFarmerReputation(sellerId);
  return serializeReview(saved.data());
}
