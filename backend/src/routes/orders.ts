import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import {
  acceptFarmerOrder,
  listFarmerOrders,
  rejectFarmerOrder,
  requireFarmerOrder,
} from '../services/order';
import { validationMessage } from '../validators/validation';
import { orderIdParamSchema, orderQuerySchema, rejectOrderSchema } from '../validators/order';

export function createOrdersRouter(): Router {
  const router = Router();

  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate, requireRole('farmer'));

  router.get('/', async (req, res, next) => {
    const query = orderQuerySchema.safeParse(req.query);
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }

    try {
      res.json(await listFarmerOrders(req.auth!.uid, query.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:orderId', async (req, res, next) => {
    const params = orderIdParamSchema.safeParse(req.params);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }

    try {
      res.json(await requireFarmerOrder(req.auth!.uid, params.data.orderId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:orderId/accept', async (req, res, next) => {
    const params = orderIdParamSchema.safeParse(req.params);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }

    try {
      res.json(await acceptFarmerOrder(req.auth!.uid, params.data.orderId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:orderId/reject', async (req, res, next) => {
    const params = orderIdParamSchema.safeParse(req.params);
    const body = rejectOrderSchema.safeParse(req.body);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }

    try {
      res.json(await rejectFarmerOrder(req.auth!.uid, params.data.orderId, body.data.reason));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
