import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { authenticate } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import {
  markNotificationRead,
  registerDeviceToken,
  removeDeviceToken,
} from '../services/notifications';
import {
  deviceTokenSchema,
  notificationIdParamSchema,
  removeDeviceTokenSchema,
} from '../validators/notification';
import { validationMessage } from '../validators/validation';

function parseOrThrow<T>(
  schema: {
    safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: any };
  },
  data: unknown,
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', validationMessage(result.error));
  }
  return result.data;
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

export function createNotificationsRouter(): Router {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60_000, max: 60 }));
  router.use(authenticate);

  router.post(
    '/devices',
    asyncRoute(async (req, res) => {
      const input = parseOrThrow(deviceTokenSchema, req.body);
      await registerDeviceToken(req.auth!.uid, input.token, input.platform);
      res.status(204).end();
    }),
  );

  router.delete(
    '/devices',
    asyncRoute(async (req, res) => {
      const input = parseOrThrow(removeDeviceTokenSchema, req.body);
      await removeDeviceToken(req.auth!.uid, input.token);
      res.status(204).end();
    }),
  );

  router.post(
    '/:notificationId/read',
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(notificationIdParamSchema, req.params);
      await markNotificationRead(req.auth!.uid, params.notificationId);
      res.status(204).end();
    }),
  );

  return router;
}
