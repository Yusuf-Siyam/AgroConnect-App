import { resolveDiseaseProvider } from '../config/photoAdvice';
import { AiNotConfiguredError } from './aiErrors';
import { createExternalPhotoAdvisor } from './externalPhotoAdvisor';
import { createGeminiVisionAdvisor } from './geminiVision';
import type { CropDiseaseClassifier, PlantPhotoAdvisor } from '../types/ai';

/** Production advisor selection. Tests inject their own advisor through createApp. */
export function createPhotoAdvisor(classifier: CropDiseaseClassifier): PlantPhotoAdvisor {
  const provider = resolveDiseaseProvider();
  if (provider === 'gemini') return createGeminiVisionAdvisor();
  if (provider === 'external') return createExternalPhotoAdvisor(classifier);
  return {
    async suggest() {
      throw new AiNotConfiguredError(
        'AI photo suggestion',
        'Set DISEASE_PROVIDER=gemini or DISEASE_PROVIDER=external on the backend.',
      );
    },
  };
}
