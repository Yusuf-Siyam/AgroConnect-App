import { z } from 'zod';

import { env } from '../config/env';
import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import { AiNotConfiguredError } from '../providers/aiErrors';
import type {
  AiLanguage,
  AiTextProvider,
  CropDiseaseClassifier,
  CropDiseaseResult,
  Diagnosis,
  DiagnosisImageAsset,
  DiagnosisList,
  DiagnosisStatus,
} from '../types/ai';
import type { DiagnoseInput, PaginationInput } from '../validators/ai';

import { consumeAiQuota } from './aiQuota';
import { getCloudinaryService } from './cloudinary';

export const ADVISORY_NOTICE = 'This is advisory, not a guaranteed diagnosis.';
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
      ? 'বাংলায় সংক্ষিপ্ত পরামর্শ দিন: লক্ষণ, প্রতিরোধ, সার ও সেচের টিপস।'
      : 'Give brief advisory tips in English: symptoms, prevention, fertilizer and irrigation.';
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
        'Give only practical, advisory farming tips: symptoms, prevention, fertilizer and irrigation.',
        'Never claim a guaranteed diagnosis.',
        'For chemicals, tell the farmer to follow the label and ask a local agricultural extension officer.',
        ADVISORY_NOTICE,
      ].join(' '),
    });
  } catch {
    return undefined;
  }
}

async function fetchDiagnosisImage(image: DiagnosisImageAsset): Promise<{ imageData: Buffer; mimeType: string }> {
  const cloudinary = getCloudinaryService();
  const { data, mimeType: rawMimeType } = await cloudinary.readAsset(image);
  const mimeType = ALLOWED_MIME_TYPES.has(rawMimeType.toLowerCase()) ? rawMimeType.toLowerCase() : 'image/jpeg';
  if (data.byteLength <= 0 || data.byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError(400, 'IMAGE_TOO_LARGE', 'The image must be 5 MB or smaller.');
  }
  return { imageData: data, mimeType };
}

export async function createDiagnosis(
  userId: string,
  input: DiagnoseInput,
  classifier: CropDiseaseClassifier,
  textProvider: AiTextProvider,
): Promise<Diagnosis> {
  const cloudinary = getCloudinaryService();
  cloudinary.assertOwnedAsset(input.image, userId, 'diagnosis');
  const diagnosisId = diagnosisIdFromImage(input.image, userId);
  await consumeAiQuota(userId, 'diagnose');

  const { imageData, mimeType } = await fetchDiagnosisImage(input.image);
  const rawResult = await classifier.classify({
    image: input.image,
    imageData,
    mimeType,
    ...(input.cropName ? { cropName: input.cropName } : {}),
  });
  const result: CropDiseaseResult = {
    label: rawResult.label.trim().slice(0, 200),
    confidence: rawResult.confidence,
    alternatives: rawResult.alternatives.map((item) => item.trim().slice(0, 200)).slice(0, 10),
  };
  const status = confidenceStatus(result.confidence);
  const publicResult: CropDiseaseResult =
    status === 'uncertain'
      ? { label: 'Uncertain - please upload a clearer photo', confidence: result.confidence, alternatives: [] }
      : result;
  const language = input.language ?? 'bn';
  const guidance =
    status === 'uncertain'
      ? undefined
      : await optionalGuidance(language, publicResult.label, input.cropName, textProvider);
  const now = new Date().toISOString();
  const record = {
    userId,
    image: input.image,
    ...(input.cropName ? { cropName: input.cropName } : {}),
    confidence: result.confidence,
    status,
    result: publicResult,
    advisoryNotice: ADVISORY_NOTICE,
    ...(guidance ? { guidance } : {}),
    language,
    createdAt: now,
    updatedAt: now,
  };

  const { firestore } = getFirebaseAdmin();
  const ref = firestore.collection('cropDiagnoses').doc(diagnosisId);
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpError(409, 'DIAGNOSIS_DUPLICATE', 'This diagnosis already exists.');
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

export function assertDiseaseConfigured(): void {
  const endpoint = process.env.DISEASE_MODEL_ENDPOINT?.trim() ?? '';
  const apiKey = process.env.DISEASE_MODEL_API_KEY?.trim() ?? '';
  if (!endpoint || !apiKey) {
    throw new AiNotConfiguredError(
      'Disease classifier',
      'Set DISEASE_MODEL_ENDPOINT and DISEASE_MODEL_API_KEY on the backend.',
    );
  }
}
