import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { addCartItem, clearCart, getCart, removeCartItem, updateCartItem } from '../services/cart';
import {
  addCartItemSchema,
  updateCartItemSchema,
} from '../validators/buyerState';
import { productIdParamSchema } from '../validators/product';
import { emptyQuerySchema, validationMessage } from '../validators/validation';

/** Buyer-owned cart. All writes are validated and performed by the backend. */
export function createCartRouter(): Router {
  const router = Router();

  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate, requireRole('buyer'));

  router.get('/', async (req, res, next) => {
    const query = emptyQuerySchema.safeParse(req.query);
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }
    try {
      res.json(await getCart(req.auth!.uid));
    } catch (error) {
      next(error);
    }
  });

  router.post('/items', async (req, res, next) => {
    const parsed = addCartItemSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.status(201).json(await addCartItem(req.auth!.uid, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/items/:productId', async (req, res, next) => {
    const params = productIdParamSchema.safeParse(req.params);
    const body = updateCartItemSchema.safeParse(req.body);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }
    try {
      res.json(await updateCartItem(req.auth!.uid, params.data.productId, body.data));
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
      res.json(await removeCartItem(req.auth!.uid, params.data.productId));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/', async (req, res, next) => {
    const query = emptyQuerySchema.safeParse(req.query);
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }
    try {
      res.json(await clearCart(req.auth!.uid));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
