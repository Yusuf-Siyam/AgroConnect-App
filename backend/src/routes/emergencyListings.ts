import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import {
  createEmergencyListing,
  listFarmerEmergencyListings,
  listPublicEmergencyListings,
  requireOwnedEmergencyListing,
  updateEmergencyListing,
} from '../services/emergencyListing';
import {
  createEmergencyListingSchema,
  emergencyListingIdParamSchema,
  emergencyListingQuerySchema,
  updateEmergencyListingSchema,
} from '../validators/emergencyListing';
import { emptyQuerySchema, validationMessage } from '../validators/validation';

export function createEmergencyListingsRouter(): Router {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate);

  router.get('/public', requireRole('buyer'), async (req, res, next) => {
    const parsed = emergencyListingQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.json(await listPublicEmergencyListings(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireRole('farmer'), async (req, res, next) => {
    const parsed = createEmergencyListingSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.status(201).json(await createEmergencyListing(req.auth!.uid, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/mine', requireRole('farmer'), async (req, res, next) => {
    const parsed = emergencyListingQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.json(await listFarmerEmergencyListings(req.auth!.uid, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:listingId', requireRole('farmer'), async (req, res, next) => {
    const params = emergencyListingIdParamSchema.safeParse(req.params);
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
      res.json(await requireOwnedEmergencyListing(req.auth!.uid, params.data.listingId));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:listingId', requireRole('farmer'), async (req, res, next) => {
    const params = emergencyListingIdParamSchema.safeParse(req.params);
    const body = updateEmergencyListingSchema.safeParse(req.body);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }
    try {
      res.json(await updateEmergencyListing(req.auth!.uid, params.data.listingId, body.data));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
