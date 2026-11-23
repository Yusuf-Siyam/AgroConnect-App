import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { signUpload, uploadToCloudinary } from '@/services/cloudinaryUpload';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type ImageSource = 'camera' | 'gallery';

export type DiagnosisImageAsset = {
  provider: 'cloudinary';
  publicId: string;
  resourceType: 'image';
  deliveryType: 'authenticated';
  version?: number;
  format?: string;
};

export class ImagePermissionError extends Error {
  constructor(public readonly source: ImageSource, public readonly canAskAgain: boolean) {
    super(source === 'camera' ? 'Camera permission denied' : 'Photo permission denied');
    this.name = 'ImagePermissionError';
  }
}

async function ensurePermission(source: ImageSource): Promise<void> {
  if (source === 'camera') {
    const current = await ImagePicker.getCameraPermissionsAsync();
    const status = current.granted ? current : await ImagePicker.requestCameraPermissionsAsync();
    if (!status.granted) throw new ImagePermissionError('camera', status.canAskAgain);
    return;
  }

  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  const status = current.granted ? current : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!status.granted) throw new ImagePermissionError('gallery', status.canAskAgain);
}

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Unable to read the selected image.');
  return response.blob();
}

export async function uploadDiagnosisImage(
  _uid: string,
  source: ImageSource,
  onProgress?: (fraction: number) => void,
): Promise<{ image: DiagnosisImageAsset } | null> {
  await ensurePermission(source);

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0]!;
  const mimeType = asset.mimeType?.toLowerCase() ?? '';
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw Object.assign(new Error('Unsupported image type'), { code: 'INVALID_IMAGE_TYPE' });
  }

  const compressed = await manipulateAsync(asset.uri, [{ resize: { width: 1600 } }], {
    compress: 0.8,
    format: SaveFormat.JPEG,
  });
  const blob = await uriToBlob(compressed.uri);
  if (blob.size > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error('Compressed image is still too large'), { code: 'IMAGE_TOO_LARGE' });
  }

  const signed = await signUpload({ purpose: 'diagnosis' });
  const uploaded = await uploadToCloudinary(blob, signed, onProgress);
  return {
    image: {
      provider: 'cloudinary',
      publicId: uploaded.publicId,
      resourceType: 'image',
      deliveryType: 'authenticated',
      version: uploaded.version,
      format: uploaded.format,
    },
  };
}
