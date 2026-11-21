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
  DiagnosisList,
  DiagnosisStatus,
} from '../types/ai';
import type { DiagnoseInput, PaginationInput } from '../validators/ai';

import { consumeAiQuota } from './aiQuota';

export const ADVISORY_NOTICE = 'This is advisory, not a guaranteed diagnosis.';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_PATH_PATTERN = /^cropDiagnoses\/([^/]+)\/([^/]+)\/([^/]+)$/;

const storedResultSchema = z.object({
  label: z.string(),
  confidence: z.number(),
  alternatives: z.array(z.string()),
});

const storedDiagnosisSchema = z.object({
  userId: z.string(),
  imagePath: z.string(),
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

function parseImagePath(userId: string, imagePath: string): { diagnosisId: string } {
  const match = IMAGE_PATH_PATTERN.exec(imagePath);
  if (!match || match[1] !== userId || !/^[A-Za-z0-9_-]{1,128}$/.test(match[2] ?? '')) {
    throw new HttpError(
      400,
      'INVALID_IMAGE_PATH',
      'The image path must be cropDiagnoses/{your uid}/{diagnosisId}/{fileName}.',
    );
  }
  return { diagnosisId: match[2]! };
}

function serializeDiagnosis(id: string, data: unknown): Diagnosis {
  const parsed = storedDiagnosisSchema.parse(data);
  const diagnosis: Diagnosis = {
    id,
    userId: parsed.userId,
    imagePath: parsed.imagePath,
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
    // A classifier result is still valid when advisory guidance is unavailable.
    return undefined;
  }
}

export async function createDiagnosis(
  userId: string,
  input: DiagnoseInput,
  classifier: CropDiseaseClassifier,
  textProvider: AiTextProvider,
): Promise<Diagnosis> {
  const { diagnosisId } = parseImagePath(userId, input.imagePath);
  const { storage, firestore } = getFirebaseAdmin();
  const file = storage.bucket().file(input.imagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpError(404, 'IMAGE_NOT_FOUND', 'The uploaded image was not found.');
  }

  const [metadata] = await file.getMetadata();
  const mimeType = typeof metadata.contentType === 'string' ? metadata.contentType.toLowerCase() : '';
  const size = Number(metadata.size ?? 0);
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new HttpError(400, 'INVALID_IMAGE_TYPE', 'Only JPEG, PNG and WebP images are supported.');
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
    throw new HttpError(400, 'IMAGE_TOO_LARGE', 'The image must be 5 MB or smaller.');
  }

  await consumeAiQuota(userId, 'diagnose');

  const [imageData] = await file.download();
  const rawResult = await classifier.classify({
    imagePath: input.imagePath,
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
  // Crop names are identifiers, not prose; default to Bangla unless the farmer
  // explicitly requests another language.
  const language = input.language ?? 'bn';
  const guidance =
    status === 'uncertain'
      ? undefined
      : await optionalGuidance(language, publicResult.label, input.cropName, textProvider);
  const now = new Date().toISOString();
  const record = {
    userId,
    imagePath: input.imagePath,
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

  const ref = firestore.collection('cropDiagnoses').doc(diagnosisId);
  const existing = await ref.get();
  if (existing.exists) {
    throw new HttpError(409, 'DIAGNOSIS_DUPLICATE', 'This diagnosis already exists.');
  }
  await ref.set(record);

  return serializeDiagnosis(ref.id, record);
}

export async function listDiagnoses(
  userId: string,
  query: PaginationInput,
): Promise<DiagnosisList> {
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
  const { firestore, storage } = getFirebaseAdmin();
  const prefix = diagnosis.imagePath.replace(/\/[^/]+$/, '/');
  const [files] = await storage.bucket().getFiles({ prefix });
  await Promise.all(files.map((file) => file.delete()));
  await firestore.collection('cropDiagnoses').doc(diagnosisId).delete();
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
