import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { evaluateOpenGroupPurchases } from '../services/groupPurchase';
import { listFarmerIds, recomputeAllFarmerReputations, recomputeFarmerReputation } from '../services/reputation';
import { reputationRecomputeSchema } from '../validators/admin';
import { emptyQuerySchema, validationMessage } from '../validators/validation';

/** Narrow Phase 11 admin maintenance surface; no payments or user management. */
export function createAdminRouter(): Router {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60_000, max: 60 }));
  router.use(authenticate, requireRole('admin'));

  router.post('/reputation/recompute', async (req, res, next) => {
    const body = reputationRecomputeSchema.safeParse(req.body ?? {});
    const query = emptyQuerySchema.safeParse(req.query);
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }

    try {
      if (body.data.farmerId) {
        const allowed = await listFarmerIds();
        if (!allowed.includes(body.data.farmerId)) {
          throw new HttpError(404, 'FARMER_NOT_FOUND', 'Farmer profile not found.');
        }
        res.json({ recomputed: 1, reputation: await recomputeFarmerReputation(body.data.farmerId) });
        return;
      }
      res.json({ recomputed: await recomputeAllFarmerReputations() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/group-purchases/evaluate', async (req, res, next) => {
    const body = emptyQuerySchema.safeParse(req.body ?? {});
    const query = emptyQuerySchema.safeParse(req.query);
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }
    try {
      res.json(await evaluateOpenGroupPurchases());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
