import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { getWeather } from '../services/weather';
import { validationMessage } from '../validators/validation';
import { weatherQuerySchema } from '../validators/weather';

export function createWeatherRouter(): Router {
  const router = Router();

  router.use(createRateLimiter({ windowMs: 60_000, max: 60 }));
  router.use(authenticate, requireRole('farmer'));

  router.get('/', async (req, res, next) => {
    const query = weatherQuerySchema.safeParse(req.query);
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }

    try {
      res.json(await getWeather(query.data));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
