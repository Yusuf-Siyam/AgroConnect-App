import { Router } from 'express';

import { createRateLimiter } from '../middleware/rateLimit';
import { listCategories } from '../services/marketplace';

/** Public localized category list shared by the mobile marketplace filters. */
export function createCategoriesRouter(): Router {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));

  router.get('/', (_req, res) => {
    res.json(listCategories());
  });

  return router;
}
