import { Router, type NextFunction, type Request, type Response } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import {
  createProductBatch,
  deleteProductBatch,
  getProductBatch,
  listProductBatches,
  traceProductBatch,
  updateProductBatch,
} from '../services/productBatch';
import {
  createProductBatchSchema,
  productBatchIdParamSchema,
  productBatchListQuerySchema,
  traceProductBatchSchema,
  updateProductBatchSchema,
} from '../validators/productBatch';
import { validationMessage } from '../validators/validation';

/** Farmer-owned product batches plus signed-in rate-limited public trace. */
export function createProductBatchesRouter(): Router {
  const router = Router();
  const traceLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

  router.post('/trace', traceLimiter, authenticate, async (req, res, next) => {
    const parsed = traceProductBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.json(await traceProductBatch(parsed.data.code));
    } catch (error) {
      next(error);
    }
  });

  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate, requireRole('farmer'));

  router.post('/', async (req, res, next) => {
    const parsed = createProductBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.status(201).json(await createProductBatch(req.auth!.uid, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    const parsed = productBatchListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.json(await listProductBatches(req.auth!.uid, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:batchId', async (req, res, next) => {
    const parsed = productBatchIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.json(await getProductBatch(req.auth!.uid, parsed.data.batchId));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:batchId', async (req, res, next) => {
    const params = productBatchIdParamSchema.safeParse(req.params);
    const body = updateProductBatchSchema.safeParse(req.body);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }
    try {
      res.json(await updateProductBatch(req.auth!.uid, params.data.batchId, body.data));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:batchId', async (req, res, next) => {
    const parsed = productBatchIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      await deleteProductBatch(req.auth!.uid, parsed.data.batchId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
