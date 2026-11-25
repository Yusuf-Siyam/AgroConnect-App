import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AiNotConfiguredError } from '../providers/aiErrors';
import {
  assertPhotoAdviceConfigured,
  photoAdviceStatus,
  resolveDiseaseProvider,
  type PhotoAdviceConfig,
} from './photoAdvice';

function config(overrides: Partial<PhotoAdviceConfig> = {}): PhotoAdviceConfig {
  return {
    diseaseProvider: 'gemini',
    geminiApiKey: 'test-key',
    geminiVisionModel: 'test-vision-model',
    diseaseModelEndpoint: '',
    diseaseModelApiKey: '',
    ...overrides,
  };
}

describe('photo advice configuration', () => {
  it('accepts a complete Gemini snapshot used by both the API and diagnostic', () => {
    assert.equal(resolveDiseaseProvider(config()), 'gemini');
    assert.doesNotThrow(() => assertPhotoAdviceConfigured(config()));
    assert.deepEqual(photoAdviceStatus(config()), {
      provider: 'gemini',
      photoAdviceConfigured: true,
      geminiApiKeyPresent: true,
      geminiVisionModelPresent: true,
      externalConfigured: false,
    });
  });

  it('reports the exact missing Gemini values without exposing them', () => {
    const missingModel = config({ geminiVisionModel: '   ' });
    assert.throws(
      () => assertPhotoAdviceConfigured(missingModel),
      (error: unknown) => error instanceof AiNotConfiguredError && /GEMINI_VISION_MODEL/.test(error.message),
    );
    assert.equal(photoAdviceStatus(missingModel).photoAdviceConfigured, false);
    assert.equal(photoAdviceStatus(missingModel).geminiApiKeyPresent, true);
    assert.equal(photoAdviceStatus(missingModel).geminiVisionModelPresent, false);

    const missingKey = config({ geminiApiKey: '' });
    assert.throws(
      () => assertPhotoAdviceConfigured(missingKey),
      (error: unknown) => error instanceof AiNotConfiguredError && /GEMINI_API_KEY/.test(error.message),
    );
  });

  it('keeps disabled and external providers explicit', () => {
    assert.equal(resolveDiseaseProvider(config({ diseaseProvider: '' })), 'none');
    assert.equal(photoAdviceStatus(config({ diseaseProvider: 'none' })).photoAdviceConfigured, false);
    assert.throws(
      () => assertPhotoAdviceConfigured(config({ diseaseProvider: 'none' })),
      (error: unknown) => error instanceof AiNotConfiguredError && error.code === 'AI_NOT_CONFIGURED',
    );

    const external = config({
      diseaseProvider: 'external',
      diseaseModelEndpoint: 'https://classifier.example.test/diagnose',
      diseaseModelApiKey: 'external-key',
    });
    assert.doesNotThrow(() => assertPhotoAdviceConfigured(external));
    assert.equal(photoAdviceStatus(external).externalConfigured, true);
  });
});
