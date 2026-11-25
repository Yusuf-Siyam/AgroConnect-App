import type { InlineDiagnosisImage } from './types';

export const MAX_DIAGNOSIS_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DIAGNOSIS_BASE64_CHARS = 6_991_064;
const SUPPORTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

export function normalizeMimeType(value: string | null | undefined): string | undefined {
  const normalized = value?.split(';')[0]?.trim().toLowerCase();
  return normalized || undefined;
}

export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

/** Build the exact API payload; bytes stay in memory and are never uploaded for storage. */
export function buildInlineImage(base64: string, mimeType: string): InlineDiagnosisImage {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized || !SUPPORTED_MIME_TYPES.has(normalized)) {
    throw codedError('INVALID_IMAGE_TYPE', 'Unsupported image type');
  }
  if (!base64 || !BASE64_PATTERN.test(base64)) {
    throw codedError('INVALID_IMAGE_DATA', 'Invalid base64 image data');
  }
  if (base64.length > MAX_DIAGNOSIS_BASE64_CHARS || base64ByteLength(base64) > MAX_DIAGNOSIS_IMAGE_BYTES) {
    throw codedError('IMAGE_TOO_LARGE', 'Compressed image is still too large');
  }
  return { provider: 'inline', mimeType: normalized as InlineDiagnosisImage['mimeType'], data: base64 };
}
