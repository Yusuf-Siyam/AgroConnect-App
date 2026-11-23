import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { getCloudinaryService } from '../services/cloudinary';
import { requireOwnedProduct } from '../services/product';
import { signUploadSchema } from '../validators/upload';
import { validationMessage } from '../validators/validation';

export function createUploadsRouter(): Router {
  const router = Router();
  const signLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

  router.get('/config', authenticate, (_req, res) => {
    const cloudinary = getCloudinaryService();
    res.json({
      provider: 'cloudinary',
      enabled: cloudinary.isConfigured(),
    });
  });

  router.post('/sign', authenticate, requireRole('farmer'), signLimiter, async (req, res, next) => {
    const parsed = signUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }

    try {
      const cloudinary = getCloudinaryService();
      cloudinary.assertConfigured();

      if (parsed.data.purpose === 'product') {
        await requireOwnedProduct(req.auth!.uid, parsed.data.productId);
      }

      const signed = cloudinary.createSignedUpload({
        purpose: parsed.data.purpose,
        uid: req.auth!.uid,
        ...(parsed.data.purpose === 'product' ? { productId: parsed.data.productId } : {}),
      });
      res.json(signed);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
