import { Router } from 'express';

import { authenticate } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { getFarmerReputation } from '../services/reputation';
import { farmerIdParamSchema } from '../validators/marketplace';
import { emptyQuerySchema, validationMessage } from '../validators/validation';

/** Signed-in public reputation reads. The response is an explicit allow-list. */
export function createReputationRouter(): Router {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate);

  router.get('/:farmerId', async (req, res, next) => {
    const params = farmerIdParamSchema.safeParse(req.params);
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
      res.json(await getFarmerReputation(params.data.farmerId));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
