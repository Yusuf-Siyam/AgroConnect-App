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
  INVALID_STOCK: 'error.invalidStock',
  INSUFFICIENT_STOCK: 'error.insufficientStock',
  PRODUCT_UNAVAILABLE: 'error.productUnavailable',
  INVALID_ORDER_TRANSITION: 'error.invalidOrderTransition',
  ORDER_NOT_FOUND: 'error.orderNotFound',
  DISTRICT_NOT_FOUND: 'error.districtNotFound',
  WEATHER_TIMEOUT: 'error.weatherTimeout',
  WEATHER_PROVIDER_ERROR: 'error.weatherProvider',
  LOCATION_REQUIRED: 'error.locationRequired',
  INVALID_RESPONSE: 'error.invalidResponse',
};

export function farmerApiErrorKey(code: string | undefined): TranslationKey {
  return (code && apiErrorKeys[code]) || 'error.generic';
}
