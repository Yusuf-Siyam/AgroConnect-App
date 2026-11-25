import type { TranslationKey } from '@/i18n';

/** Backend error codes are never shown raw; the UI uses translated copy. */
export function aiErrorKey(code?: string): TranslationKey {
  switch (code) {
    case 'AI_NOT_CONFIGURED':
      return 'ai.error.notConfigured';
    case 'AI_PROVIDER_AUTH':
      return 'ai.error.credentials';
    case 'AI_MODEL_UNAVAILABLE':
      return 'ai.error.modelUnavailable';
    case 'AI_PROVIDER_UNAVAILABLE':
    case 'HTTP_500':
    case 'HTTP_502':
    case 'HTTP_503':
      return 'ai.error.unavailable';
    case 'AI_DAILY_MESSAGE_LIMIT_REACHED':
    case 'AI_DAILY_DIAGNOSIS_LIMIT_REACHED':
      return 'ai.error.limitReached';
    case 'AI_RATE_LIMITED':
    case 'HTTP_429':
      return 'ai.error.rateLimited';
    case 'AI_PROVIDER_TIMEOUT':
    case 'HTTP_504':
      return 'ai.error.timeout';
    case 'AI_PROVIDER_ERROR':
      return 'ai.error.provider';
    case 'IMAGE_NOT_FOUND':
      return 'ai.error.imageNotFound';
    case 'INVALID_IMAGE_TYPE':
    case 'INVALID_IMAGE_FORMAT':
      return 'ai.error.invalidFormat';
    case 'INVALID_IMAGE_DATA':
    case 'INVALID_IMAGE_ASSET':
    case 'VALIDATION_ERROR':
    case 'HTTP_400':
      return 'ai.error.invalidImage';
    case 'IMAGE_TOO_LARGE':
      return 'ai.error.tooLarge';
    case 'INVALID_IMAGE_PATH':
      return 'ai.error.invalidPath';
    case 'DIAGNOSIS_DUPLICATE':
      return 'ai.error.duplicate';
    case 'NETWORK_ERROR':
      return 'error.network';
    default:
      return 'error.generic';
  }
}

const RETRYABLE_CODES = new Set([
  'AI_PROVIDER_UNAVAILABLE',
  'AI_RATE_LIMITED',
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_ERROR',
  'NETWORK_ERROR',
  'HTTP_429',
  'HTTP_500',
  'HTTP_502',
  'HTTP_503',
  'HTTP_504',
]);

/** Permanent failures must not offer a retry with the same invalid input/config. */
export function isRetryableAiError(code?: string): boolean {
  return Boolean(code && RETRYABLE_CODES.has(code));
}
