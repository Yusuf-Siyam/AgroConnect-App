import { z } from 'zod';

export const addCartItemSchema = z
  .object({
    productId: z.string().trim().min(1).max(128),
    quantity: z.number().int().positive(),
  })
  .strict();

export const updateCartItemSchema = z
  .object({ quantity: z.number().int().positive() })
  .strict();

export const addWishlistItemSchema = z
  .object({ productId: z.string().trim().min(1).max(128) })
  .strict();

export const wishlistQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const reviewQuerySchema = z
  .object({
    productId: z.string().trim().min(1).max(128),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const createReviewSchema = z
  .object({
    productId: z.string().trim().min(1).max(128),
    rating: z.number().int().min(1).max(5),
    text: z.string().trim().max(1000).optional(),
  })
  .strict();

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type AddWishlistItemInput = z.infer<typeof addWishlistItemSchema>;
export type WishlistQuery = z.infer<typeof wishlistQuerySchema>;
export type ReviewQuery = z.infer<typeof reviewQuerySchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
