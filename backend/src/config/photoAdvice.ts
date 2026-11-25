import { env } from './env';

import { AiNotConfiguredError } from '../providers/aiErrors';
import type { DiseaseProvider, PhotoUncertainty } from '../types/ai';

export const PHOTO_ADVICE_NOTICE =
  'Unverified AI photo suggestion - check with a local agriculture extension officer before acting.';
export const CHEMICAL_SAFETY_NOTICE =
  'Never apply a chemical without reading its label and asking a local agriculture extension officer.';

const PROVIDERS = new Set<DiseaseProvider>(['none', 'gemini', 'external']);

/**
 * One parsed snapshot, loaded from backend/.env by config/env.ts. The API
 * server and ai:check-vision both use it, so they cannot disagree about config.
 * Tests pass an explicit snapshot instead of mutating global process.env.
 */
export type PhotoAdviceConfig = {
  diseaseProvider: string;
  geminiApiKey: string;
  geminiVisionModel: string;
  diseaseModelEndpoint: string;
  diseaseModelApiKey: string;
};

export function photoAdviceConfig(): PhotoAdviceConfig {
  return {
    diseaseProvider: env.diseaseProvider,
    geminiApiKey: env.geminiApiKey,
    geminiVisionModel: env.geminiVisionModel,
    diseaseModelEndpoint: env.diseaseModelEndpoint,
    diseaseModelApiKey: env.diseaseModelApiKey,
  };
}

function present(value: string): boolean {
  return Boolean(value.trim());
}

export function resolveDiseaseProvider(config: PhotoAdviceConfig = photoAdviceConfig()): DiseaseProvider {
  const raw = config.diseaseProvider.trim() || 'none';
  if (PROVIDERS.has(raw as DiseaseProvider)) return raw as DiseaseProvider;
  throw new AiNotConfiguredError(
    'AI photo suggestion',
    'Set DISEASE_PROVIDER to none, gemini or external on the backend.',
  );
}

export function assertPhotoAdviceConfigured(config: PhotoAdviceConfig = photoAdviceConfig()): void {
  const provider = resolveDiseaseProvider(config);
  if (provider === 'none') {
    throw new AiNotConfiguredError(
      'AI photo suggestion',
      'Set DISEASE_PROVIDER=gemini or DISEASE_PROVIDER=external on the backend.',
    );
  }
  if (provider === 'gemini') {
    if (!present(config.geminiApiKey) || !present(config.geminiVisionModel)) {
      throw new AiNotConfiguredError(
        'Gemini photo advisor',
        'Set GEMINI_API_KEY and GEMINI_VISION_MODEL on the backend.',
      );
    }
    return;
  }
  if (!present(config.diseaseModelEndpoint) || !present(config.diseaseModelApiKey)) {
    throw new AiNotConfiguredError(
      'External photo advisor',
      'Set DISEASE_MODEL_ENDPOINT and DISEASE_MODEL_API_KEY on the backend.',
    );
  }
}

/** Safe, secret-free snapshot for health checks and the farmer AI screen. */
export function photoAdviceStatus(config: PhotoAdviceConfig = photoAdviceConfig()): {
  provider: DiseaseProvider | 'invalid';
  photoAdviceConfigured: boolean;
  geminiApiKeyPresent: boolean;
  geminiVisionModelPresent: boolean;
  externalConfigured: boolean;
} {
  let provider: DiseaseProvider | 'invalid' = 'invalid';
  let configured = false;
  try {
    provider = resolveDiseaseProvider(config);
    assertPhotoAdviceConfigured(config);
    configured = true;
  } catch {
    configured = false;
  }
  return {
    provider,
    photoAdviceConfigured: configured,
    geminiApiKeyPresent: present(config.geminiApiKey),
    geminiVisionModelPresent: present(config.geminiVisionModel),
    externalConfigured: present(config.diseaseModelEndpoint) && present(config.diseaseModelApiKey),
  };
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
