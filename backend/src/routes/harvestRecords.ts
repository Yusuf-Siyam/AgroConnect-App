import { Router, type NextFunction, type Request, type Response } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import {
  createHarvestRecord,
  deleteHarvestRecord,
  getHarvestRecord,
  listHarvestRecords,
  setHarvestRecordStatus,
  updateHarvestRecord,
} from '../services/harvestRecord';
import {
  createHarvestRecordSchema,
  harvestRecordIdParamSchema,
  harvestRecordListQuerySchema,
  harvestStatusSchema,
  updateHarvestRecordSchema,
} from '../validators/harvestRecord';
import { validationMessage } from '../validators/validation';

/** Farmer-owned harvest calendar. Every write goes through this backend router. */
export function createHarvestRecordsRouter(): Router {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate, requireRole('farmer'));

  router.post('/', async (req, res, next) => {
    const parsed = createHarvestRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.status(201).json(await createHarvestRecord(req.auth!.uid, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req, res, next) => {
    const parsed = harvestRecordListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.json(await listHarvestRecords(req.auth!.uid, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:recordId', async (req, res, next) => {
    const parsed = harvestRecordIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      res.json(await getHarvestRecord(req.auth!.uid, parsed.data.recordId));
    } catch (error) {
      next(error);
    }
  });

  const changeStatus = async (req: Request, res: Response, next: NextFunction) => {
    const params = harvestRecordIdParamSchema.safeParse(req.params);
    const body = harvestStatusSchema.safeParse(req.body);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }
    try {
      res.json(await setHarvestRecordStatus(req.auth!.uid, params.data.recordId, body.data));
    } catch (error) {
      next(error);
    }
  };

  // POST is the documented status action; PATCH is kept as a safe alias.
  router.post('/:recordId/status', changeStatus);
  router.patch('/:recordId/status', changeStatus);

  router.patch('/:recordId', async (req, res, next) => {
    const params = harvestRecordIdParamSchema.safeParse(req.params);
    const body = updateHarvestRecordSchema.safeParse(req.body);
    if (!params.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(params.error)));
      return;
    }
    if (!body.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(body.error)));
      return;
    }
    try {
      res.json(await updateHarvestRecord(req.auth!.uid, params.data.recordId, body.data));
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:recordId', async (req, res, next) => {
    const parsed = harvestRecordIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      next(new HttpError(400, 'VALIDATION_ERROR', validationMessage(parsed.error)));
      return;
    }
    try {
      await deleteHarvestRecord(req.auth!.uid, parsed.data.recordId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
