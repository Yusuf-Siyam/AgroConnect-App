import { z } from 'zod';

import { api, assertApiConfigured, toApiError } from '@/services/api';

import type { Review, ReviewEligibility, ReviewList } from './types';

const reviewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  buyerId: z.string(),
  sellerId: z.string(),
  rating: z.number().int(),
  text: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const reviewListSchema = z.object({
  items: z.array(reviewSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});

const eligibilitySchema = z.object({
  eligible: z.boolean(),
  hasReviewed: z.boolean(),
  reason: z.enum(['NOT_DELIVERED', 'NO_DELIVERED_PRODUCT', 'ALREADY_REVIEWED']).optional(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw { code: 'INVALID_RESPONSE', message: 'Unexpected API response' } as const;
  }
  return result.data;
}

export async function getReviewEligibility(productId: string): Promise<ReviewEligibility> {
  assertApiConfigured();
  try {
    const response = await api.get(`/api/reviews/eligibility/${productId}`);
    return parseOrThrow(eligibilitySchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listReviews(
  productId: string,
  limit = 5,
  offset = 0,
): Promise<ReviewList> {
  assertApiConfigured();
  try {
    const response = await api.get('/api/reviews', {
      params: { productId, limit, offset },
    });
    return parseOrThrow(reviewListSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function createReview(input: {
  productId: string;
  rating: number;
  text?: string;
}): Promise<Review> {
  assertApiConfigured();
  try {
    const response = await api.post('/api/reviews', input);
    return parseOrThrow(reviewSchema, response.data);
  } catch (error) {
    throw toApiError(error);
  }
}
