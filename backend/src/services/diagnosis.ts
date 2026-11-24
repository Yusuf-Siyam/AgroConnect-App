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
  CropDiseaseResult,
  Diagnosis,
  DiagnosisImageAsset,
  DiagnosisList,
  DiagnosisStatus,
  PlantPhotoAdvice,
  PlantPhotoAdvisor,
} from '../types/ai';
import type { DiagnoseInput, PaginationInput } from '../validators/ai';

import { consumeAiQuota } from './aiQuota';
import { getCloudinaryService } from './cloudinary';

export const ADVISORY_NOTICE = PHOTO_ADVICE_NOTICE;
const UNCLEAR_LABEL = 'Unclear photo - please upload a clearer photo';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storedResultSchema = z.object({
  label: z.string(),
  confidence: z.number(),
  alternatives: z.array(z.string()),
});

const storedImageSchema = z.object({
  provider: z.literal('cloudinary'),
  publicId: z.string(),
  resourceType: z.literal('image'),
  deliveryType: z.literal('authenticated'),
  version: z.number().int().positive().optional(),
  format: z.string().optional(),
});

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

export function confidenceStatus(confidence: number): DiagnosisStatus {
  if (confidence < env.diseaseUncertainMax) return 'uncertain';
  if (confidence <= env.diseasePossibleMax) return 'possible';
  return 'likely';
}

function diagnosisIdFromImage(image: DiagnosisImageAsset, uid: string): string {
  const segments = image.publicId.split('/').filter(Boolean);
  // agroconnect/diagnoses/{uid}/{diagnosisId}/photo
  const diagnosisId = segments[3];
  const expectedPrefix = `agroconnect/diagnoses/${uid}/${diagnosisId}`;
  if (!diagnosisId || !/^[A-Za-z0-9_-]{1,128}$/.test(diagnosisId) || !image.publicId.startsWith(`${expectedPrefix}/`)) {
    throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'Diagnosis image asset is invalid.');
  }
  return diagnosisId;
}

function serializeDiagnosis(id: string, data: unknown): Diagnosis {
  const parsed = storedDiagnosisSchema.parse(data);
  const cloudinary = getCloudinaryService();
  const diagnosis: Diagnosis = {
    id,
    userId: parsed.userId,
    image: parsed.image,
    imageUrl: cloudinary.isConfigured() ? cloudinary.buildDeliveryUrl(parsed.image) : '',
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
  return Boolean(process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_MODEL?.trim());
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

async function fetchDiagnosisImage(image: DiagnosisImageAsset): Promise<{ imageData: Buffer; mimeType: string }> {
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
): Promise<Diagnosis> {
  const cloudinary = getCloudinaryService();
  cloudinary.assertOwnedAsset(input.image, userId, 'diagnosis');
  const diagnosisId = diagnosisIdFromImage(input.image, userId);
  await consumeAiQuota(userId, 'diagnose');

  const { imageData, mimeType } = await fetchDiagnosisImage(input.image);
  const language = input.language ?? 'bn';
  const advice = await advisor.suggest({
    image: input.image,
    imageData,
    mimeType,
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

  const now = new Date().toISOString();
  const record = {
    userId,
    image: input.image,
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

  const { firestore } = getFirebaseAdmin();
  const ref = firestore.collection('cropDiagnoses').doc(diagnosisId);
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpError(409, 'DIAGNOSIS_DUPLICATE', 'This suggestion already exists.');
  }
  await ref.set(record);
  return serializeDiagnosis(ref.id, record);
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
