import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { authenticate } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import {
  createConversation,
  getChat,
  listChats,
  listMessages,
  markChatRead,
  sendMessage,
} from '../services/chat';
import { validationMessage } from '../validators/validation';
import {
  chatIdParamSchema,
  chatPaginationSchema,
  createConversationSchema,
  messagePaginationSchema,
  messageSchema,
} from '../validators/chat';

function parseOrThrow<T>(schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: any } }, data: unknown): T {
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

export function createChatRouter(): Router {
  const router = Router();
  router.use(createRateLimiter({ windowMs: 60_000, max: 120 }));
  router.use(authenticate);

  router.post(
    '/conversations',
    asyncRoute(async (req, res) => {
      const input = parseOrThrow(createConversationSchema, req.body);
      res.status(201).json(await createConversation(req.auth!.uid, req.auth!.role, input));
    }),
  );

  router.get(
    '/conversations',
    asyncRoute(async (req, res) => {
      const query = parseOrThrow(chatPaginationSchema, req.query);
      res.json(await listChats(req.auth!.uid, req.auth!.role, query));
    }),
  );

  router.get(
    '/conversations/:chatId',
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(chatIdParamSchema, req.params);
      res.json(await getChat(req.auth!.uid, req.auth!.role, params.chatId));
    }),
  );

  router.get(
    '/conversations/:chatId/messages',
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(chatIdParamSchema, req.params);
      const query = parseOrThrow(messagePaginationSchema, req.query);
      res.json(await listMessages(req.auth!.uid, req.auth!.role, params.chatId, query));
    }),
  );

  router.post(
    '/conversations/:chatId/messages',
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(chatIdParamSchema, req.params);
      const input = parseOrThrow(messageSchema, req.body);
      const result = await sendMessage(
        req.auth!.uid,
        req.auth!.role,
        params.chatId,
        input.text,
        input.clientMessageId,
      );
      res.status(result.duplicate ? 200 : 201).json(result.message);
    }),
  );

  router.post(
    '/conversations/:chatId/read',
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(chatIdParamSchema, req.params);
      await markChatRead(req.auth!.uid, req.auth!.role, params.chatId);
      res.status(204).end();
    }),
  );

  return router;
}
