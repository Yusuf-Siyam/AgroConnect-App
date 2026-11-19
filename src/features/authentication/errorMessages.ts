import type { TranslationKey } from '@/i18n';
import type { AuthErrorCode } from './authService';

const authErrorKeys: Record<AuthErrorCode, TranslationKey> = {
  'invalid-credentials': 'error.invalidCredentials',
  'email-in-use': 'error.emailInUse',
  'weak-password': 'error.weakPassword',
  'invalid-email': 'error.invalidEmail',
  network: 'error.network',
  'config-missing': 'auth.configMissingMessage',
  unknown: 'error.generic',
};

const validationKeys = new Set<TranslationKey>([
  'validation.required',
  'validation.invalidEmail',
  'validation.passwordMin',
  'validation.nameMin',
  'validation.phoneInvalid',
  'validation.roleRequired',
  'validation.vehicleTypeRequired',
  'validation.registrationRequired',
  'validation.passwordsMatch',
]);

export function authErrorKey(code: AuthErrorCode | null): TranslationKey {
  return code ? authErrorKeys[code] : 'error.generic';
}

export function validationKey(message: string | undefined): TranslationKey {
  return message && validationKeys.has(message as TranslationKey)
    ? (message as TranslationKey)
    : 'validation.required';
}
