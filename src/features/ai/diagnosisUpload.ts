import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { buildInlineImage, codedError, normalizeMimeType } from './diagnosisImage';
import type { DiagnosisImageAsset } from './types';

export type ImageSource = 'camera' | 'gallery';

export class ImagePermissionError extends Error {
  constructor(public readonly source: ImageSource, public readonly canAskAgain: boolean) {
    super(source === 'camera' ? 'Camera permission denied' : 'Photo permission denied');
    this.name = 'ImagePermissionError';
  }
}

export { base64ByteLength, buildInlineImage, normalizeMimeType } from './diagnosisImage';

/** The picker may return HEIC/AVIF; ImageManipulator converts it to JPEG. */
export function assertPickedImage(asset: Pick<ImagePicker.ImagePickerAsset, 'type' | 'mimeType'>): void {
  if (asset.type && asset.type !== 'image') {
    throw codedError('INVALID_IMAGE_TYPE', 'Only photos can be reviewed');
  }
  const mimeType = normalizeMimeType(asset.mimeType);
  if (mimeType && !mimeType.startsWith('image/')) {
    throw codedError('INVALID_IMAGE_TYPE', 'Unsupported image type');
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

/**
 * Pick and normalize one photo to the backend's inline JPEG payload.
 * No signed Cloudinary upload, permanent asset, or storage URL is involved.
 */
export async function prepareDiagnosisImage(
  source: ImageSource,
): Promise<{ image: DiagnosisImageAsset; uri: string } | null> {
  await ensurePermission(source);

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0]!;
  assertPickedImage(asset);

  // SDK 58 contextual API: decode with bounds, then save once as compressed JPEG.
  const context = ImageManipulator.manipulate(asset.uri, { maxWidth: 1600, maxHeight: 1600 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) {
    throw codedError('INVALID_IMAGE_DATA', 'Unable to read the selected image.');
  }

  return {
    image: buildInlineImage(saved.base64, 'image/jpeg'),
    uri: saved.uri,
  };
}

// Kept as an explicit alias for any existing imports; it no longer uploads.
export const uploadDiagnosisImage = prepareDiagnosisImage;
