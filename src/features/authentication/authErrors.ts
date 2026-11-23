export const AUTH_ERROR_CODES = [
  'invalid-credentials',
  'too-many-attempts',
  'email-in-use',
  'weak-password',
  'invalid-email',
  'network',
  'config-missing',
  'permission-denied',
  'unknown',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

const firebaseCodeMap: Record<string, AuthErrorCode> = {
  'auth/invalid-credential': 'invalid-credentials',
  'auth/wrong-password': 'invalid-credentials',
  'auth/user-not-found': 'invalid-credentials',
  'auth/too-many-requests': 'too-many-attempts',
  'auth/email-already-in-use': 'email-in-use',
  'auth/weak-password': 'weak-password',
  'auth/invalid-email': 'invalid-email',
  'auth/network-request-failed': 'network',
  'auth/emulator-config-failed': 'network',
  'auth/config-missing': 'config-missing',
  'permission-denied': 'permission-denied',
  'firestore/permission-denied': 'permission-denied',
  unavailable: 'network',
  'firestore/unavailable': 'network',
};

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code: unknown }).code ?? '');
  }
  return '';
}

/**
 * Pure Firebase auth error mapper. It never reads env, Firebase or React state,
 * so it can be exercised directly by the mobile unit tests.
 */
export function toAuthErrorCode(error: unknown): AuthErrorCode {
  const code = errorCode(error);
  const exact = firebaseCodeMap[code];
  if (exact) return exact;

  if (code.includes('too-many-requests') || code.includes('too-many-attempts')) return 'too-many-attempts';
  if (code.includes('wrong-password') || code.includes('user-not-found') || code.includes('invalid-credential')) {
    return 'invalid-credentials';
  }
  if (code.includes('email-already-in-use')) return 'email-in-use';
  if (code.includes('weak-password')) return 'weak-password';
  if (code.includes('invalid-email')) return 'invalid-email';
  if (code.includes('permission-denied')) return 'permission-denied';
  if (code.includes('unavailable') || code.includes('network') || code.includes('emulator')) return 'network';
  if (code.includes('config-missing')) return 'config-missing';

  return 'unknown';
}
