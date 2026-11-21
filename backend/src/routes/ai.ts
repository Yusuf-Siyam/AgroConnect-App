import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { createGeminiTextProvider } from '../providers/gemini';
import { toAiHttpError } from '../providers/aiErrors';
import {
  chatWithFarmer,
  deleteConversation,
  getConversation,
  listConversations,
} from '../services/aiChat';
import { validationMessage } from '../validators/validation';
import type { AiTextProvider } from '../types/ai';
import {
  chatSchema,
  conversationIdParamSchema,
  paginationSchema,
} from '../validators/ai';

function parseOrThrow<T>(schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: any } }, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', validationMessage(result.error));
  }
  return result.data;
}

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch((error: unknown) => {
      if (error instanceof HttpError) {
        next(error);
        return;
      }
      const mapped = toAiHttpError(error);
      next(new HttpError(mapped.statusCode, mapped.code, mapped.message));
    });
  };
}

export function createAiRouter(provider: AiTextProvider = createGeminiTextProvider()): Router {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60_000, max: 60 }));
  router.use(authenticate);
  router.use(requireRole('farmer'));

  router.post(
    '/chat',
    asyncRoute(async (req, res) => {
      const input = parseOrThrow(chatSchema, req.body);
      res.json(await chatWithFarmer(req.auth!.uid, input, provider));
    }),
  );

  router.get(
    '/conversations',
    asyncRoute(async (req, res) => {
      const query = parseOrThrow(paginationSchema, req.query);
      res.json(await listConversations(req.auth!.uid, query));
    }),
  );

  router.get(
    '/conversations/:conversationId',
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(conversationIdParamSchema, req.params);
      res.json(await getConversation(req.auth!.uid, params.conversationId));
    }),
  );

  router.delete(
    '/conversations/:conversationId',
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(conversationIdParamSchema, req.params);
      await deleteConversation(req.auth!.uid, params.conversationId);
      res.status(204).end();
    }),
  );

  return router;
}
