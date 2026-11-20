import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { listMarketplaceProducts } from '../services/marketplace';
import { requirePublicProduct } from '../services/product';
import { emptyQuerySchema, validationMessage } from '../validators/validation';
import { marketplaceQuerySchema, type MarketplaceQuery } from '../validators/marketplace';
import { productIdParamSchema } from '../validators/product';

/**
 * Buyer-only marketplace. `/api/products` stays farmer-inventory scoped so
 * existing Phase 05 behavior is unchanged; buyers use `/api/marketplace/products`.
 */
export function createBuyerMarketplaceRouter(): Router {
  const router = Router();

  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate, requireRole('buyer'));

  router.get('/products', async (req, res, next) => {
    const parsed = marketplaceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }

    try {
      res.json(await listMarketplaceProducts(parsed.data as MarketplaceQuery));
    } catch (error) {
      next(error);
    }
  });

  router.get('/products/:productId', async (req, res, next) => {
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
      res.json(await requirePublicProduct(params.data.productId));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
