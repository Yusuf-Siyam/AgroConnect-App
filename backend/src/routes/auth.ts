import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { getOrCreateProfile, updateUserProfile } from '../services/userProfile';
import { updateProfileSchema, validationMessage } from '../validators/auth';

export function createAuthRouter(): Router {
  const router = Router();

  // Protects token-verification and profile endpoints from casual brute force.
  router.use(createRateLimiter({ windowMs: 60_000, max: 60 }));
  router.use(authenticate);

  router.get('/me', async (req, res, next) => {
    try {
      const profile = await getOrCreateProfile(req.auth!.uid, req.auth!.role);
      res.json(profile);
    } catch (error) {
      next(error);
    }
  });

  // Lightweight real role check; admins are identified only by trusted claims.
  router.get('/admin-status', requireRole('admin'), (req, res) => {
    res.json({ uid: req.auth!.uid, role: req.auth!.role });
  });

  router.patch('/profile', async (req, res, next) => {
    const parsed = updateProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }

    try {
      const profile = await updateUserProfile(req.auth!.uid, parsed.data);
      res.json(profile);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
