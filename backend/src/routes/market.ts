import { Router } from 'express';

import { authenticate } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { listPriceHistory } from '../services/market';
import { marketQuerySchema } from '../validators/market';
import { validationMessage } from '../validators/validation';

export function createMarketRouter(): Router {
  const router = Router();

  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate);

  router.get('/', async (req, res, next) => {
    const query = marketQuerySchema.safeParse(req.query);
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }

    try {
      res.json(await listPriceHistory(query.data));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
