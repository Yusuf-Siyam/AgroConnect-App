import { Router } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import {
  acceptDeliveryJob,
  confirmDelivery,
  confirmPickup,
  getBuyerDelivery,
  getDeliveryJob,
  getEarningsSummary,
  listAvailableJobs,
  listEarnings,
  listMyDeliveries,
  rejectDeliveryJob,
  startDelivery,
  updateJobLocation,
} from '../services/delivery';
import {
  createTransporterProfile,
  getTransporterProfile,
  updateTransporterProfile,
} from '../services/transporter';
import { validationMessage } from '../validators/validation';
import {
  createTransporterProfileSchema,
  deliveryCodeSchema,
  jobIdParamSchema,
  locationSchema,
  orderIdParamSchema,
  paginationSchema,
  rejectJobSchema,
  updateTransporterProfileSchema,
} from '../validators/delivery';

function parseOrThrow<T>(schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: any } }, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', validationMessage(result.error));
  }
  return result.data;
}

function asyncRoute(
  handler: (req: import('express').Request, res: import('express').Response) => Promise<void>,
) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    handler(req, res).catch(next);
  };
}

export function createDeliveryRouter(): Router {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate);

  router.post(
    '/transporter-profile',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const input = parseOrThrow(createTransporterProfileSchema, req.body);
      res.status(201).json(await createTransporterProfile(req.auth!.uid, input));
    }),
  );

  router.get(
    '/transporter-profile',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const profile = await getTransporterProfile(req.auth!.uid);
      if (!profile) throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Transporter profile not found.');
      res.json(profile);
    }),
  );

  router.patch(
    '/transporter-profile',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const input = parseOrThrow(updateTransporterProfileSchema, req.body);
      res.json(await updateTransporterProfile(req.auth!.uid, input));
    }),
  );

  router.get(
    '/jobs',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const query = parseOrThrow(paginationSchema, req.query);
      res.json(await listAvailableJobs(req.auth!.uid, query));
    }),
  );

  router.get(
    '/jobs/mine',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const query = parseOrThrow(paginationSchema, req.query);
      res.json(await listMyDeliveries(req.auth!.uid, query));
    }),
  );

  router.get(
    '/jobs/:jobId',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(jobIdParamSchema, req.params);
      res.json(await getDeliveryJob(req.auth!.uid, params.jobId));
    }),
  );

  router.post(
    '/jobs/:jobId/accept',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(jobIdParamSchema, req.params);
      res.json(await acceptDeliveryJob(req.auth!.uid, params.jobId));
    }),
  );

  router.post(
    '/jobs/:jobId/reject',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(jobIdParamSchema, req.params);
      const body = parseOrThrow(rejectJobSchema, req.body ?? {});
      res.json(await rejectDeliveryJob(req.auth!.uid, params.jobId, body));
    }),
  );

  router.post(
    '/jobs/:jobId/collect',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(jobIdParamSchema, req.params);
      res.json(await confirmPickup(req.auth!.uid, params.jobId));
    }),
  );

  router.post(
    '/jobs/:jobId/ship',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(jobIdParamSchema, req.params);
      res.json(await startDelivery(req.auth!.uid, params.jobId));
    }),
  );

  router.post(
    '/jobs/:jobId/deliver',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(jobIdParamSchema, req.params);
      const body = parseOrThrow(deliveryCodeSchema, req.body);
      res.json(await confirmDelivery(req.auth!.uid, params.jobId, body));
    }),
  );

  router.post(
    '/jobs/:jobId/location',
    requireRole('transporter'),
    createRateLimiter({ windowMs: 60_000, max: 12 }),
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(jobIdParamSchema, req.params);
      const body = parseOrThrow(locationSchema, req.body);
      res.json(await updateJobLocation(req.auth!.uid, params.jobId, body));
    }),
  );

  router.get(
    '/buyer/orders/:orderId/delivery',
    requireRole('buyer'),
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(orderIdParamSchema, req.params);
      res.json(await getBuyerDelivery(req.auth!.uid, params.orderId));
    }),
  );

  router.get(
    '/earnings/summary',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      res.json(await getEarningsSummary(req.auth!.uid));
    }),
  );

  router.get(
    '/earnings/history',
    requireRole('transporter'),
    asyncRoute(async (req, res) => {
      const query = parseOrThrow(paginationSchema, req.query);
      res.json(await listEarnings(req.auth!.uid, query));
    }),
  );

  return router;
}
