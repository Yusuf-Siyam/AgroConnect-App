import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { getFarmerAnalytics } from '../services/analytics';
import { emptyQuerySchema, validationMessage } from '../validators/validation';

export function createAnalyticsRouter(): Router {
  const router = Router();

  router.use(createRateLimiter({ windowMs: 60_000, max: 60 }));
  router.use(authenticate, requireRole('farmer'));

  router.get('/farmer', async (req, res, next) => {
    const query = emptyQuerySchema.safeParse(req.query);
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }

    try {
      res.json(await getFarmerAnalytics(req.auth!.uid));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
