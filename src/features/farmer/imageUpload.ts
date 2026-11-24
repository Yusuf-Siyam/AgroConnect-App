import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { signUpload, uploadToCloudinary } from '@/services/cloudinaryUpload';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DIMENSION = 1600;

export type UploadProgress = { progress: number; total: number; index: number };

export class UploadValidationError extends Error {
  code: 'UPLOAD_IMAGE_TYPE' | 'UPLOAD_IMAGE_SIZE' | 'UPLOAD_IMAGE_LIMIT' | 'UPLOAD_READ_FAILED';
  constructor(code: UploadValidationError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) throw new UploadValidationError('UPLOAD_READ_FAILED', 'Unable to read the selected image.');
  return response.blob();
}

/**
 * Picks images, compresses them, signs a Cloudinary upload through the backend,
 * uploads directly to Cloudinary, and returns resulting secure URLs.
 */
export async function pickAndUploadProductImages(
  _uid: string,
  productId: string,
  limit: number,
  onProgress?: (value: UploadProgress) => void,
): Promise<string[]> {
  if (limit <= 0) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.85,
  });

  if (result.canceled || !result.assets?.length) return [];
  if (result.assets.length > limit) {
    throw new UploadValidationError('UPLOAD_IMAGE_LIMIT', `Select at most ${limit} images.`);
  }

  const uploaded: string[] = [];

  for (const [index, asset] of result.assets.entries()) {
    const mimeType = asset.mimeType?.toLowerCase();
    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new UploadValidationError('UPLOAD_IMAGE_TYPE', 'Only JPEG, PNG and WebP images are supported.');
    }
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      throw new UploadValidationError('UPLOAD_IMAGE_SIZE', 'Each image must be 5 MB or smaller.');
    }

    const compressed = await manipulateAsync(asset.uri, [{ resize: { width: MAX_DIMENSION } }], {
      compress: 0.82,
      format: SaveFormat.JPEG,
    });
    const blob = await uriToBlob(compressed.uri);
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new UploadValidationError('UPLOAD_IMAGE_SIZE', 'Each image must be 5 MB or smaller.');
    }

    const signed = await signUpload({ purpose: 'product', productId });
    const resultUpload = await uploadToCloudinary(blob, signed, (progress) => {
      onProgress?.({ progress, total: result.assets.length, index: index + 1 });
    });
    uploaded.push(resultUpload.secureUrl);
  }

  return uploaded;
}
