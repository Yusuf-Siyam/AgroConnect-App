import { env } from './env';

import { AiNotConfiguredError } from '../providers/aiErrors';
import type { DiseaseProvider, PhotoUncertainty } from '../types/ai';

export const PHOTO_ADVICE_NOTICE =
  'Unverified AI photo suggestion - check with a local agriculture extension officer before acting.';
export const CHEMICAL_SAFETY_NOTICE =
  'Never apply a chemical without reading its label and asking a local agriculture extension officer.';

const PROVIDERS = new Set<DiseaseProvider>(['none', 'gemini', 'external']);

/** Read at call time so tests and local config changes do not need a rebuild. */
export function resolveDiseaseProvider(): DiseaseProvider {
  const raw = (process.env.DISEASE_PROVIDER ?? '').trim() || 'none';
  if (PROVIDERS.has(raw as DiseaseProvider)) return raw as DiseaseProvider;
  throw new AiNotConfiguredError(
    'AI photo suggestion',
    'Set DISEASE_PROVIDER to none, gemini or external on the backend.',
  );
}

export function assertPhotoAdviceConfigured(): void {
  const provider = resolveDiseaseProvider();
  if (provider === 'none') {
    throw new AiNotConfiguredError(
      'AI photo suggestion',
      'Set DISEASE_PROVIDER=gemini or DISEASE_PROVIDER=external on the backend.',
    );
  }
  if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY?.trim() || !process.env.GEMINI_VISION_MODEL?.trim()) {
      throw new AiNotConfiguredError(
        'Gemini photo advisor',
        'Set GEMINI_API_KEY and GEMINI_VISION_MODEL on the backend.',
      );
    }
    return;
  }
  if (!process.env.DISEASE_MODEL_ENDPOINT?.trim() || !process.env.DISEASE_MODEL_API_KEY?.trim()) {
    throw new AiNotConfiguredError(
      'External photo advisor',
      'Set DISEASE_MODEL_ENDPOINT and DISEASE_MODEL_API_KEY on the backend.',
    );
  }
}

/** Numeric values are internal compatibility metadata and are never shown to farmers. */
const UNCERTAINTY_CONFIDENCE: Record<PhotoUncertainty, number> = {
  unclear: 0.25,
  possible: 0.6,
  likely: 0.85,
};

export function confidenceForUncertainty(uncertainty: PhotoUncertainty): number {
  return UNCERTAINTY_CONFIDENCE[uncertainty];
}

export function uncertaintyForConfidence(confidence: number): PhotoUncertainty {
  if (confidence < env.diseaseUncertainMax) return 'unclear';
  if (confidence <= env.diseasePossibleMax) return 'possible';
  return 'likely';
}
