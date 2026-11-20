import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { addWishlistItem, getWishlist, removeWishlistItem } from '../services/wishlist';
import { addWishlistItemSchema, wishlistQuerySchema } from '../validators/buyerState';
import { productIdParamSchema } from '../validators/product';
import { emptyQuerySchema, validationMessage } from '../validators/validation';

/** Buyer-owned wishlist with duplicate prevention. */
export function createWishlistRouter(): Router {
  const router = Router();

  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate, requireRole('buyer'));

  router.get('/', async (req, res, next) => {
    const parsed = wishlistQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.json(await getWishlist(req.auth!.uid, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.post('/items', async (req, res, next) => {
    const parsed = addWishlistItemSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      await addWishlistItem(req.auth!.uid, parsed.data.productId);
      res.status(201).json(await getWishlist(req.auth!.uid, { limit: 20, offset: 0 }));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/items/:productId', async (req, res, next) => {
    const params = productIdParamSchema.safeParse(req.params);
    const query = emptyQuerySchema.safeParse(req.query);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }
    try {
      await removeWishlistItem(req.auth!.uid, params.data.productId);
      res.json(await getWishlist(req.auth!.uid, { limit: 20, offset: 0 }));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
