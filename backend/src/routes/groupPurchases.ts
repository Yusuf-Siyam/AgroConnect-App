import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import {
  cancelGroupPurchase,
  createGroupPurchase,
  getGroupParticipation,
  getGroupPurchase,
  joinGroupPurchase,
  leaveGroupPurchase,
  listGroupPurchases,
} from '../services/groupPurchase';
import {
  createGroupPurchaseSchema,
  groupPurchaseIdParamSchema,
  groupPurchaseQuerySchema,
  joinGroupPurchaseSchema,
} from '../validators/groupPurchase';
import { emptyQuerySchema, validationMessage } from '../validators/validation';

export function createGroupPurchasesRouter(): Router {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate);

  router.get('/', async (req, res, next) => {
    const parsed = groupPurchaseQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.json(await listGroupPurchases(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:groupId', async (req, res, next) => {
    const params = groupPurchaseIdParamSchema.safeParse(req.params);
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
      const group = await getGroupPurchase(params.data.groupId);
      const myParticipant = req.auth?.role === 'buyer'
        ? await getGroupParticipation(params.data.groupId, req.auth.uid)
        : null;
      res.json({ ...group, myParticipant });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireRole('farmer'), async (req, res, next) => {
    const parsed = createGroupPurchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.status(201).json(await createGroupPurchase(req.auth!.uid, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:groupId/join', requireRole('buyer'), async (req, res, next) => {
    const params = groupPurchaseIdParamSchema.safeParse(req.params);
    const body = joinGroupPurchaseSchema.safeParse(req.body ?? {});
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }
    try {
      res.status(201).json(await joinGroupPurchase(params.data.groupId, req.auth!.uid, body.data));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:groupId/leave', requireRole('buyer'), async (req, res, next) => {
    const params = groupPurchaseIdParamSchema.safeParse(req.params);
    const body = emptyQuerySchema.safeParse(req.body ?? {});
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }
    try {
      res.json(await leaveGroupPurchase(params.data.groupId, req.auth!.uid));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:groupId/cancel', async (req, res, next) => {
    const params = groupPurchaseIdParamSchema.safeParse(req.params);
    const body = emptyQuerySchema.safeParse(req.body ?? {});
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }
    try {
      const role = req.auth!.role;
      if (role !== 'farmer' && role !== 'admin') {
        next(new HttpError(403, 'FORBIDDEN', 'Only the creator or admin can cancel this group purchase.'));
        return;
      }
      res.json(await cancelGroupPurchase(params.data.groupId, req.auth!.uid, role === 'admin'));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
