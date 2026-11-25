import { createHash } from 'node:crypto';

import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { assertPhotoAdviceConfigured, photoAdviceStatus } from '../config/photoAdvice';
import { authenticate, requireRole } from '../middleware/auth';
import { HttpError } from '../middleware/error';
import { createRateLimiter } from '../middleware/rateLimit';
import { createCropDiseaseClassifier } from '../providers/diseaseClassifier';
import { createGeminiTextProvider } from '../providers/gemini';
import { createPhotoAdvisor } from '../providers/photoAdvisor';
import { toAiHttpError } from '../providers/aiErrors';
import {
  chatWithFarmer,
  deleteConversation,
  getConversation,
  listConversations,
} from '../services/aiChat';
import {
  createDiagnosis,
  deleteDiagnosis,
  getDiagnosis,
  listDiagnoses,
} from '../services/diagnosis';
import { validationMessage } from '../validators/validation';
import type {
  AiTextProvider,
  CropDiseaseClassifier,
  Diagnosis,
  DiagnosisImageAsset,
  PlantPhotoAdvisor,
} from '../types/ai';
import { InFlightMap } from '../utils/inFlight';
import {
  chatSchema,
  conversationIdParamSchema,
  diagnoseSchema,
  diagnosisIdParamSchema,
  paginationSchema,
} from '../validators/ai';

function parseOrThrow<T>(schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: any } }, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', validationMessage(result.error));
  }
  return result.data;
}

function diagnosisRequestKey(userId: string, image: DiagnosisImageAsset): string {
  const fingerprint =
    image.provider === 'inline'
      ? `${image.mimeType}:${image.data}`
      : `${image.publicId}:${image.resourceType}:${image.deliveryType}`;
  return `${userId}:${createHash('sha256').update(fingerprint).digest('hex')}`;
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

export function createAiRouter(
  provider: AiTextProvider = createGeminiTextProvider(),
  classifier: CropDiseaseClassifier = createCropDiseaseClassifier(),
  photoAdvisor: PlantPhotoAdvisor = createPhotoAdvisor(classifier),
): Router {
  const router = Router();
  // A repeated tap while a diagnosis is running reuses the first request.
  const diagnosisRequests = new InFlightMap<Diagnosis>();
  router.use(createRateLimiter({ windowMs: 60_000, max: 60 }));
  router.use(authenticate);
  router.use(requireRole('farmer'));

  // Secret-free snapshot of the config the running server actually loaded.
  router.get(
    '/status',
    asyncRoute(async (_req, res) => {
      res.json(photoAdviceStatus());
    }),
  );

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

  router.post(
    '/diagnose',
    asyncRoute(async (req, res) => {
      assertPhotoAdviceConfigured();
      const input = parseOrThrow(diagnoseSchema, req.body);
      const uid = req.auth!.uid;
      const diagnosis = await diagnosisRequests.run(diagnosisRequestKey(uid, input.image), () =>
        createDiagnosis(uid, input, photoAdvisor, provider),
      );
      res.status(201).json(diagnosis);
    }),
  );

  router.get(
    '/diagnoses',
    asyncRoute(async (req, res) => {
      const query = parseOrThrow(paginationSchema, req.query);
      res.json(await listDiagnoses(req.auth!.uid, query));
    }),
  );

  router.get(
    '/diagnoses/:diagnosisId',
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(diagnosisIdParamSchema, req.params);
      res.json(await getDiagnosis(req.auth!.uid, params.diagnosisId));
    }),
  );

  router.delete(
    '/diagnoses/:diagnosisId',
    asyncRoute(async (req, res) => {
      const params = parseOrThrow(diagnosisIdParamSchema, req.params);
      await deleteDiagnosis(req.auth!.uid, params.diagnosisId);
      res.status(204).end();
    }),
  );

  return router;
}
