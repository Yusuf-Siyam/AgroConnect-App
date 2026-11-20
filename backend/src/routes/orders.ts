import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import {
  acceptFarmerOrder,
  cancelOrder,
  createOrderCheckout,
  listBuyerOrders,
  listFarmerOrders,
  rejectFarmerOrder,
  requireVisibleOrder,
} from '../services/order';
import { validationMessage } from '../validators/validation';
import {
  cancelOrderSchema,
  createOrderSchema,
  orderIdParamSchema,
  orderQuerySchema,
  rejectOrderSchema,
} from '../validators/order';

export function createOrdersRouter(): Router {
  const router = Router();

  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate);

  router.post('/', requireRole('buyer'), async (req, res, next) => {
    const body = createOrderSchema.safeParse(req.body);
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }

    try {
      res.status(201).json(await createOrderCheckout(req.auth!.uid, body.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/mine', requireRole('buyer'), async (req, res, next) => {
    const query = orderQuerySchema.safeParse(req.query);
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }

    try {
      res.json(await listBuyerOrders(req.auth!.uid, query.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/', requireRole('farmer'), async (req, res, next) => {
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
      res.json(await requireVisibleOrder(req.auth!.uid, req.auth!.role, params.data.orderId));
    } catch (error) {
      next(error);
    }
  });

  router.post('/:orderId/accept', requireRole('farmer'), async (req, res, next) => {
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

  router.post('/:orderId/reject', requireRole('farmer'), async (req, res, next) => {
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

  router.post('/:orderId/cancel', requireRole('buyer', 'admin'), async (req, res, next) => {
    const params = orderIdParamSchema.safeParse(req.params);
    const body = cancelOrderSchema.safeParse(req.body ?? {});
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }

    try {
      const role = req.auth!.role === 'admin' ? 'admin' : 'buyer';
      res.json(await cancelOrder(req.auth!.uid, role, params.data.orderId, body.data.reason));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
