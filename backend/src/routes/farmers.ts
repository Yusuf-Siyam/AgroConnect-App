import { Router } from 'express';

import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { getPublicFarmerProfile } from '../services/marketplace';
import { emptyQuerySchema, validationMessage } from '../validators/validation';
import { farmerIdParamSchema } from '../validators/marketplace';

/**
 * Public farmer profile. The service builds an explicit allow-list response,
 * so phone, email and address can never be returned here.
 */
export function createFarmerProfileRouter(): Router {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));

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
      res.json(await getPublicFarmerProfile(params.data.farmerId));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
