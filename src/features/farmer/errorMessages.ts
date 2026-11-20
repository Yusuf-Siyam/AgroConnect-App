import { validationKey as authValidationKey } from '@/features/authentication/errorMessages';
import type { TranslationKey } from '@/i18n';

const farmerValidationKeys = new Set<TranslationKey>([
  'validation.pricePositive',
  'validation.stockInvalid',
  'validation.quantityPositive',
  'validation.dateInvalid',
  'error.imageType',
  'error.imageSize',
  'error.productSaveFailed',
]);

export function validationKey(message: string | undefined): TranslationKey {
  if (message && farmerValidationKeys.has(message as TranslationKey)) {
    return message as TranslationKey;
  }
  return authValidationKey(message);
}

const apiErrorKeys: Record<string, TranslationKey> = {
  'api/not-configured': 'error.apiNotConfigured',
  NETWORK_ERROR: 'error.network',
  VALIDATION_ERROR: 'error.productValidation',
  INVALID_IMAGE_URL: 'error.imageType',
  PRODUCT_NOT_FOUND: 'error.productNotFound',
  FORBIDDEN: 'error.forbidden',
  UNAUTHORIZED: 'error.unauthorized',
};

export function farmerApiErrorKey(code: string | undefined): TranslationKey {
  return (code && apiErrorKeys[code]) || 'error.generic';
}
