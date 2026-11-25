import { createHash } from 'node:crypto';

import { z } from 'zod';

import { env } from '../config/env';
import { getFirebaseAdmin } from '../config/firebase';
import {
  assertPhotoAdviceConfigured,
  confidenceForUncertainty,
  PHOTO_ADVICE_NOTICE,
} from '../config/photoAdvice';
import { HttpError } from '../middleware/error';
import type {
  AiLanguage,
  AiTextProvider,
  CloudinaryDiagnosisImage,
  CropDiseaseResult,
  Diagnosis,
  DiagnosisImageAsset,
  DiagnosisList,
  DiagnosisStatus,
  InlineDiagnosisImage,
  PlantPhotoAdvice,
  PlantPhotoAdvisor,
} from '../types/ai';
import type { DiagnoseInput, PaginationInput } from '../validators/ai';

import { consumeAiQuota } from './aiQuota';
import { getCloudinaryService } from './cloudinary';

export const ADVISORY_NOTICE = PHOTO_ADVICE_NOTICE;
const UNCLEAR_LABEL = 'Unclear photo - please upload a clearer photo';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_INLINE_BASE64_CHARS = 6_991_064;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

const storedResultSchema = z.object({
  label: z.string(),
  confidence: z.number(),
  alternatives: z.array(z.string()),
});

const storedCloudinaryImageSchema = z.object({
  provider: z.literal('cloudinary'),
  publicId: z.string(),
  resourceType: z.literal('image'),
  deliveryType: z.literal('authenticated'),
  version: z.number().int().positive().optional(),
  format: z.string().optional(),
});

// Inline records deliberately omit the base64 bytes after the single request.
const storedInlineImageSchema = z.object({
  provider: z.literal('inline'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.undefined().optional(),
});

const storedImageSchema = z.union([storedCloudinaryImageSchema, storedInlineImageSchema]);

const storedDiagnosisSchema = z.object({
  userId: z.string(),
  image: storedImageSchema,
  cropName: z.string().optional(),
  confidence: z.number(),
  status: z.enum(['uncertain', 'possible', 'likely']),
  result: storedResultSchema,
  advisoryNotice: z.string(),
  source: z.enum(['gemini_vision', 'external_classifier']).default('external_classifier'),
  verified: z.boolean().default(false),
  guidance: z.string().optional(),
  language: z.enum(['bn', 'en']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Minimal write surface used by createDiagnosis; test doubles implement this. */
export type DiagnosisWriteStore = {
  collection(name: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean; data(): unknown }>;
      set(data: Record<string, unknown>): Promise<unknown>;
    };
  };
};

export type DiagnosisDependencies = {
  store?: DiagnosisWriteStore;
  consumeQuota?: (userId: string, kind: 'diagnose') => Promise<void>;
  now?: () => string;
};

export function confidenceStatus(confidence: number): DiagnosisStatus {
  if (confidence < env.diseaseUncertainMax) return 'uncertain';
  if (confidence <= env.diseasePossibleMax) return 'possible';
  return 'likely';
}

function diagnosisIdFromImage(image: CloudinaryDiagnosisImage, uid: string): string {
  const segments = image.publicId.split('/').filter(Boolean);
  // agroconnect/diagnoses/{uid}/{diagnosisId}/photo
  const diagnosisId = segments[3];
  const expectedPrefix = `agroconnect/diagnoses/${uid}/${diagnosisId}`;
  if (!diagnosisId || !/^[A-Za-z0-9_-]{1,128}$/.test(diagnosisId) || !image.publicId.startsWith(`${expectedPrefix}/`)) {
    throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'Diagnosis image asset is invalid.');
  }
  return diagnosisId;
}

export function isInlineImage(image: DiagnosisImageAsset): image is InlineDiagnosisImage {
  return image.provider === 'inline';
}

function hasMatchingMagicBytes(data: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === 'image/png') {
    return (
      data.length >= 8 &&
      data[0] === 0x89 &&
      data.toString('ascii', 1, 4) === 'PNG' &&
      data.toString('ascii', 4, 8) === '\r\n\x1a\n'
    );
  }
  if (mimeType === 'image/webp') {
    return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

/** Decode and validate the one-time inline payload; no bytes are persisted. */
export function decodeInlineImage(image: InlineDiagnosisImage): { imageData: Buffer; mimeType: string } {
  if (!image.data || !BASE64_PATTERN.test(image.data)) {
    throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'Inline image data must be base64.');
  }
  if (image.data.length > MAX_INLINE_BASE64_CHARS) {
    throw new HttpError(400, 'IMAGE_TOO_LARGE', 'The image must be 5 MB or smaller.');
  }
  const imageData = Buffer.from(image.data, 'base64');
  if (imageData.byteLength === 0 || imageData.byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError(400, 'IMAGE_TOO_LARGE', 'The image must be 5 MB or smaller.');
  }
  const mimeType = image.mimeType.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType) || !hasMatchingMagicBytes(imageData, mimeType)) {
    throw new HttpError(400, 'INVALID_IMAGE_FORMAT', 'The image bytes do not match the declared image type.');
  }
  return { imageData, mimeType };
}

export function diagnosisIdForInlineImage(userId: string, image: InlineDiagnosisImage): string {
  const hash = createHash('sha256')
    .update(`${userId}:${image.mimeType}:${image.data ?? ''}`)
    .digest('hex')
    .slice(0, 32);
  return `img_${hash}`;
}

async function fetchCloudinaryImage(image: CloudinaryDiagnosisImage): Promise<{ imageData: Buffer; mimeType: string }> {
  const cloudinary = getCloudinaryService();
  const { data, mimeType: rawMimeType } = await cloudinary.readAsset(image);
  const mimeType = ALLOWED_MIME_TYPES.has(rawMimeType.toLowerCase()) ? rawMimeType.toLowerCase() : 'image/jpeg';
  if (data.byteLength <= 0 || data.byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError(400, 'IMAGE_TOO_LARGE', 'The image must be 5 MB or smaller.');
  }
  if (!hasMatchingMagicBytes(data, mimeType)) {
    throw new HttpError(400, 'INVALID_IMAGE_FORMAT', 'The image bytes do not match the declared image type.');
  }
  return { imageData: data, mimeType };
}

type PreparedImage = {
  diagnosisId: string;
  recordImage: DiagnosisImageAsset;
  imageData: Buffer;
  mimeType: string;
};

async function prepareDiagnosisImage(userId: string, image: DiagnosisImageAsset): Promise<PreparedImage> {
  if (isInlineImage(image)) {
    const { imageData, mimeType } = decodeInlineImage(image);
    return {
      diagnosisId: diagnosisIdForInlineImage(userId, image),
      recordImage: { provider: 'inline', mimeType: image.mimeType.toLowerCase() as InlineDiagnosisImage['mimeType'] },
      imageData,
      mimeType,
    };
  }

  getCloudinaryService().assertOwnedAsset(image, userId, 'diagnosis');
  const { imageData, mimeType } = await fetchCloudinaryImage(image);
  return {
    diagnosisId: diagnosisIdFromImage(image, userId),
    recordImage: image,
    imageData,
    mimeType,
  };
}

function serializeDiagnosis(id: string, data: unknown): Diagnosis {
  const parsed = storedDiagnosisSchema.parse(data);
  const imageUrl =
    parsed.image.provider === 'cloudinary' && getCloudinaryService().isConfigured()
      ? getCloudinaryService().buildDeliveryUrl(parsed.image)
      : '';
  const diagnosis: Diagnosis = {
    id,
    userId: parsed.userId,
    image: parsed.image,
    imageUrl,
    confidence: parsed.confidence,
    status: parsed.status,
    result: parsed.result,
    advisoryNotice: parsed.advisoryNotice,
    source: parsed.source,
    verified: parsed.verified,
    language: parsed.language,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
  if (parsed.cropName) diagnosis.cropName = parsed.cropName;
  if (parsed.guidance) diagnosis.guidance = parsed.guidance;
  return diagnosis;
}

async function getOwnedDiagnosis(userId: string, diagnosisId: string): Promise<Diagnosis> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await firestore.collection('cropDiagnoses').doc(diagnosisId).get();
  if (!snapshot.exists || snapshot.get('userId') !== userId) {
    throw new HttpError(404, 'DIAGNOSIS_NOT_FOUND', 'Diagnosis not found.');
  }
  return serializeDiagnosis(snapshot.id, snapshot.data());
}

function isGeminiConfigured(): boolean {
  return Boolean(env.geminiApiKey && env.geminiModel);
}

function guidancePrompt(language: AiLanguage, label: string, cropName?: string): string {
  const crop = cropName ?? 'the crop in the photo';
  const instruction =
    language === 'bn'
      ? 'বাংলায় সংক্ষিপ্ত অযাচাইকৃত পরামর্শ দিন: লক্ষণ, প্রতিরোধ, সার ও সেচের টিপস। রাসায়নিকের নাম বা মাত্রা দেবেন না।'
      : 'Give brief unverified advisory tips in English: symptoms, prevention, fertilizer and irrigation. Do not give chemical names or doses.';
  return `${instruction} Possible issue: ${label}. Crop: ${crop}. ${ADVISORY_NOTICE}`;
}

async function optionalGuidance(
  language: AiLanguage,
  label: string,
  cropName: string | undefined,
  provider: AiTextProvider,
): Promise<string | undefined> {
  if (!isGeminiConfigured()) return undefined;
  try {
    return await provider.generateText({
      messages: [{ role: 'user', text: guidancePrompt(language, label, cropName), createdAt: new Date().toISOString() }],
      language,
      systemInstruction: [
        'You are the AgroConnect farming assistant.',
        'Give only practical, unverified advisory farming tips: symptoms, prevention, fertilizer and irrigation.',
        'Never claim a confirmed diagnosis, certainty or a percentage.',
        'Never give chemical names or doses; tell the farmer to read the label and ask a local agricultural extension officer.',
        ADVISORY_NOTICE,
      ].join(' '),
    });
  } catch {
    return undefined;
  }
}

function statusForAdvice(advice: PlantPhotoAdvice): DiagnosisStatus {
  if (advice.uncertainty === 'unclear') return 'uncertain';
  return advice.uncertainty;
}

function formatCareSteps(steps: string[]): string | undefined {
  const cleaned = steps.map((step) => step.trim()).filter(Boolean).slice(0, 4);
  return cleaned.length > 0 ? cleaned.map((step, index) => `${index + 1}. ${step}`).join('\n') : undefined;
}

export async function createDiagnosis(
  userId: string,
  input: DiagnoseInput,
  advisor: PlantPhotoAdvisor,
  textProvider: AiTextProvider,
  dependencies: DiagnosisDependencies = {},
): Promise<Diagnosis> {
  const prepared = await prepareDiagnosisImage(userId, input.image);
  const quota = dependencies.consumeQuota ?? (async (uid: string, kind: 'diagnose') => consumeAiQuota(uid, kind));
  await quota(userId, 'diagnose');

  const language = input.language ?? 'bn';
  const advice = await advisor.suggest({
    image: prepared.recordImage,
    imageData: prepared.imageData,
    mimeType: prepared.mimeType,
    language,
    ...(input.cropName ? { cropName: input.cropName } : {}),
  });

  const status = statusForAdvice(advice);
  const confidence = advice.confidence ?? confidenceForUncertainty(advice.uncertainty);
  const publicResult: CropDiseaseResult =
    status === 'uncertain'
      ? { label: UNCLEAR_LABEL, confidence, alternatives: [] }
      : {
          label: `Possible issue: ${advice.observation}`,
          confidence,
          alternatives: advice.possibleCauses,
        };

  let guidance = formatCareSteps(advice.careSteps);
  if (!guidance && status !== 'uncertain' && advice.source === 'external_classifier') {
    guidance = await optionalGuidance(language, advice.observation, input.cropName, textProvider);
  }
  if (guidance && status !== 'uncertain') {
    guidance = `${guidance}\n${advice.notice}`;
  }

  const now = (dependencies.now ?? (() => new Date().toISOString()))();
  const record = {
    userId,
    image: prepared.recordImage,
    ...(input.cropName ? { cropName: input.cropName } : {}),
    confidence,
    status,
    result: publicResult,
    advisoryNotice: advice.notice,
    source: advice.source,
    verified: false,
    ...(guidance ? { guidance } : {}),
    language,
    createdAt: now,
    updatedAt: now,
  };

  const store = dependencies.store ?? (getFirebaseAdmin().firestore as unknown as DiagnosisWriteStore);
  const ref = store.collection('cropDiagnoses').doc(prepared.diagnosisId);
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpError(409, 'DIAGNOSIS_DUPLICATE', 'This suggestion already exists.');
  }
  await ref.set(record);
  return serializeDiagnosis(prepared.diagnosisId, record);
}

export async function listDiagnoses(userId: string, query: PaginationInput): Promise<DiagnosisList> {
  const { firestore } = getFirebaseAdmin();
  const base = firestore.collection('cropDiagnoses').where('userId', '==', userId);
  const [all, page] = await Promise.all([
    base.get(),
    base.orderBy('createdAt', 'desc').limit(query.limit).offset(query.offset).get(),
  ]);
  return {
    items: page.docs.map((document) => serializeDiagnosis(document.id, document.data())),
    total: all.size,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getDiagnosis(userId: string, diagnosisId: string): Promise<Diagnosis> {
  return getOwnedDiagnosis(userId, diagnosisId);
}

export async function deleteDiagnosis(userId: string, diagnosisId: string): Promise<void> {
  const diagnosis = await getOwnedDiagnosis(userId, diagnosisId);
  const { firestore } = getFirebaseAdmin();
  await firestore.collection('cropDiagnoses').doc(diagnosisId).delete();
  if (isInlineImage(diagnosis.image)) return;
  try {
    await getCloudinaryService().deleteAsset(diagnosis.image);
  } catch (error) {
    console.error('[diagnosis] Failed to delete Cloudinary asset after diagnosis delete', {
      diagnosisId,
      publicId: diagnosis.image.publicId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const assertDiseaseConfigured = assertPhotoAdviceConfigured;
