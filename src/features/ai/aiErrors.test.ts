import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aiErrorKey, isRetryableAiError } from './aiErrors';

describe('AI error translation mapping', () => {
  it('uses actionable, frontend-safe copy for provider configuration failures', () => {
    assert.equal(aiErrorKey('AI_MODEL_UNAVAILABLE'), 'ai.error.modelUnavailable');
    assert.equal(aiErrorKey('AI_PROVIDER_AUTH'), 'ai.error.credentials');
    assert.equal(aiErrorKey('AI_NOT_CONFIGURED'), 'ai.error.notConfigured');
  });

  it('distinguishes temporary unavailability, rate limits and timeouts', () => {
    assert.equal(aiErrorKey('AI_PROVIDER_UNAVAILABLE'), 'ai.error.unavailable');
    assert.equal(aiErrorKey('AI_RATE_LIMITED'), 'ai.error.rateLimited');
    assert.equal(aiErrorKey('AI_PROVIDER_TIMEOUT'), 'ai.error.timeout');
    assert.equal(aiErrorKey('AI_PROVIDER_ERROR'), 'ai.error.provider');
  });

  it('maps backend image validation codes to a clear image error', () => {
    assert.equal(aiErrorKey('INVALID_IMAGE_ASSET'), 'ai.error.invalidImage');
    assert.equal(aiErrorKey('INVALID_IMAGE_DATA'), 'ai.error.invalidImage');
    assert.equal(aiErrorKey('VALIDATION_ERROR'), 'ai.error.invalidImage');
    assert.equal(aiErrorKey('INVALID_IMAGE_FORMAT'), 'ai.error.invalidFormat');
    assert.equal(aiErrorKey('IMAGE_TOO_LARGE'), 'ai.error.tooLarge');
  });

  it('maps HTTP fallbacks and unknown backend codes safely', () => {
    assert.equal(aiErrorKey('HTTP_503'), 'ai.error.unavailable');
    assert.equal(aiErrorKey('HTTP_429'), 'ai.error.rateLimited');
    assert.equal(aiErrorKey('HTTP_504'), 'ai.error.timeout');
    assert.equal(aiErrorKey('HTTP_500'), 'ai.error.unavailable');
    assert.equal(aiErrorKey('HTTP_502'), 'ai.error.unavailable');
    assert.equal(aiErrorKey('HTTP_400'), 'ai.error.invalidImage');
    assert.equal(aiErrorKey(undefined), 'error.generic');
  });

  it('offers manual retry only for temporary failures', () => {
    for (const code of [
      'AI_PROVIDER_UNAVAILABLE',
      'AI_RATE_LIMITED',
      'AI_PROVIDER_TIMEOUT',
      'NETWORK_ERROR',
      'HTTP_503',
    ]) {
      assert.equal(isRetryableAiError(code), true, code);
    }
    for (const code of [
      'AI_NOT_CONFIGURED',
      'AI_PROVIDER_AUTH',
      'AI_MODEL_UNAVAILABLE',
      'INVALID_IMAGE_ASSET',
      'AI_DAILY_DIAGNOSIS_LIMIT_REACHED',
      undefined,
    ]) {
      assert.equal(isRetryableAiError(code), false, code ?? 'undefined');
    }
  });
});
