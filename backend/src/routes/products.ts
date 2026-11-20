import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import {
  adjustStock,
  createProduct,
  getProductStats,
  listProducts,
  listStockHistory,
  requireOwnedProduct,
  softDeleteProduct,
  updateProduct,
} from '../services/product';
import {
  createProductSchema,
  productIdParamSchema,
  productQuerySchema,
  stockAdjustmentSchema,
  stockHistoryQuerySchema,
  updateProductSchema,
} from '../validators/product';
import { emptyQuerySchema, validationMessage } from '../validators/validation';

export function createProductsRouter(): Router {
  const router = Router();

  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate, requireRole('farmer'));

  router.post('/', async (req, res, next) => {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }

    try {
      const product = await createProduct(req.auth!.uid, parsed.data);
      res.status(201).json(product);
    } catch (error) {
      next(error);
    }
  });

  router.get('/stats', async (req, res, next) => {
    const query = emptyQuerySchema.safeParse(req.query);
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }

    try {
      res.json(await getProductStats(req.auth!.uid));
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    const parsed = productQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }

    try {
      res.json(await listProducts(req.auth!.uid, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:productId', async (req, res, next) => {
    const parsed = productIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }

    try {
      res.json(await requireOwnedProduct(req.auth!.uid, parsed.data.productId));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:productId/stock-history', async (req, res, next) => {
    const params = productIdParamSchema.safeParse(req.params);
    const query = stockHistoryQuerySchema.safeParse(req.query);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!query.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(query.error)));
      return;
    }

    try {
      res.json(await listStockHistory(req.auth!.uid, params.data.productId, query.data.limit));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:productId/stock', async (req, res, next) => {
    const params = productIdParamSchema.safeParse(req.params);
    const body = stockAdjustmentSchema.safeParse(req.body);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }

    try {
      res.json(await adjustStock(req.auth!.uid, params.data.productId, body.data));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:productId', async (req, res, next) => {
    const params = productIdParamSchema.safeParse(req.params);
    const body = updateProductSchema.safeParse(req.body);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }

    try {
      res.json(await updateProduct(req.auth!.uid, params.data.productId, body.data));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:productId', async (req, res, next) => {
    const parsed = productIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }

    try {
      await softDeleteProduct(req.auth!.uid, parsed.data.productId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
