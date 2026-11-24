import {
  CHEMICAL_SAFETY_NOTICE,
  PHOTO_ADVICE_NOTICE,
  uncertaintyForConfidence,
} from '../config/photoAdvice';
import type { CropDiseaseClassifier, PlantPhotoAdvice, PlantPhotoAdvisor } from '../types/ai';

/**
 * Keeps the existing verified-model classifier contract available for a future
 * external provider. Its output is still framed as an unverified suggestion.
 */
export function createExternalPhotoAdvisor(classifier: CropDiseaseClassifier): PlantPhotoAdvisor {
  return {
    async suggest(input): Promise<PlantPhotoAdvice> {
      const result = await classifier.classify(input);
      return {
        source: 'external_classifier',
        observation: result.label.trim().slice(0, 200),
        possibleCauses: result.alternatives.map((item) => item.trim().slice(0, 200)).slice(0, 5),
        careSteps: [],
        uncertainty: uncertaintyForConfidence(result.confidence),
        confidence: result.confidence,
        verified: false,
        notice: `${PHOTO_ADVICE_NOTICE} ${CHEMICAL_SAFETY_NOTICE}`,
      };
    },
  };
}
