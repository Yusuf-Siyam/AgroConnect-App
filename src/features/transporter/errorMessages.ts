import { validationKey as authValidationKey } from '@/features/authentication/errorMessages';
import type { TranslationKey } from '@/i18n';

const transporterValidationKeys = new Set<TranslationKey>([
  'transporter.validation.nameMin',
  'transporter.validation.phoneInvalid',
  'transporter.validation.districtRequired',
  'transporter.validation.vehicleTypeRequired',
  'transporter.validation.plateRequired',
  'transporter.validation.capacityPositive',
  'transporter.validation.codeInvalid',
]);

export function validationKey(message: string | undefined): TranslationKey {
  if (message && transporterValidationKeys.has(message as TranslationKey)) {
    return message as TranslationKey;
  }
  return authValidationKey(message);
}

const apiErrorKeys: Record<string, TranslationKey> = {
  'api/not-configured': 'error.apiNotConfigured',
  NETWORK_ERROR: 'error.network',
  VALIDATION_ERROR: 'error.generic',
  FORBIDDEN: 'error.forbidden',
  UNAUTHORIZED: 'error.unauthorized',
  RATE_LIMITED: 'transporter.error.rateLimited',
  PROFILE_EXISTS: 'transporter.error.profileExists',
  PROFILE_NOT_FOUND: 'transporter.error.profileNotFound',
  TRANSPORTER_NOT_VERIFIED: 'transporter.error.notVerified',
  JOB_NOT_FOUND: 'transporter.error.jobNotFound',
  JOB_ALREADY_ACCEPTED: 'transporter.error.jobAccepted',
  JOB_REJECTED: 'transporter.error.jobRejected',
  JOB_NOT_AVAILABLE: 'transporter.error.jobUnavailable',
  NOT_ASSIGNED_TRANSPORTER: 'transporter.error.notAssigned',
  INVALID_ORDER_TRANSITION: 'error.invalidOrderTransition',
  INVALID_DELIVERY_CODE: 'transporter.error.invalidCode',
  DELIVERY_CODE_LOCKED: 'transporter.error.codeLocked',
  DELIVERY_CODE_UNAVAILABLE: 'transporter.error.codeUnavailable',
  LOCATION_RATE_LIMITED: 'transporter.error.locationRateLimited',
  JOB_NOT_ACTIVE: 'transporter.error.jobNotActive',
  INVALID_RESPONSE: 'error.invalidResponse',
};

export function transporterApiErrorKey(code: string | undefined): TranslationKey {
  return (code && apiErrorKeys[code]) || 'error.generic';
}
