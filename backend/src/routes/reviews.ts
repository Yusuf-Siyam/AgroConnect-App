import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { createReview, getReviewEligibility, listReviews } from '../services/review';
import { createReviewSchema, reviewQuerySchema } from '../validators/buyerState';
import { emptyQuerySchema, validationMessage } from '../validators/validation';
import { productIdParamSchema } from '../validators/product';

/** Buyer reviews, gated by a real delivered order containing the product. */
export function createReviewsRouter(): Router {
  const router = Router();

  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate, requireRole('buyer'));

  router.get('/', async (req, res, next) => {
    const parsed = reviewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.json(await listReviews(parsed.data.productId, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/eligibility/:productId', async (req, res, next) => {
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
      res.json(await getReviewEligibility(req.auth!.uid, params.data.productId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.status(201).json(await createReview(req.auth!.uid, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
