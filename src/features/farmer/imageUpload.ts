import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

import { getFirebase } from '@/services/firebase';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DIMENSION = 1600;

export type UploadProgress = { progress: number; total: number; index: number };

async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Unable to read the selected image.');
  return response.blob();
}

/**
 * Picks up to five JPEG/PNG/WebP images, compresses them, uploads them to
 * products/{uid}/{productId}/... and returns real Firebase Storage URLs.
 */
export async function pickAndUploadProductImages(
  uid: string,
  productId: string,
  limit: number,
  onProgress?: (value: UploadProgress) => void,
): Promise<string[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 0.8,
  });

  if (result.canceled || !result.assets?.length) return [];
  if (result.assets.length > limit) throw new Error(`Select at most ${limit} images.`);

  const { storage } = getFirebase();
  const uploaded: string[] = [];

  for (const [index, asset] of result.assets.entries()) {
    const mimeType = asset.mimeType?.toLowerCase();
    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error('Only JPEG, PNG and WebP images are supported.');
    }
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      throw new Error('Each image must be 5 MB or smaller.');
    }

    const compressed = await manipulateAsync(
      asset.uri,
      [{ resize: { width: MAX_DIMENSION } }],
      { compress: 0.8, format: SaveFormat.JPEG },
    );
    const blob = await uriToBlob(compressed.uri);
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error('Compressed image is still larger than 5 MB.');
    }

    const fileName = `${Date.now()}-${index + 1}.jpg`;
    const imageRef = ref(storage, `products/${uid}/${productId}/${fileName}`);
    const task = uploadBytesResumable(imageRef, blob, { contentType: 'image/jpeg' });

    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          onProgress?.({
            progress: snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0,
            total: result.assets.length,
            index: index + 1,
          });
        },
        reject,
        () => resolve(),
      );
    });

    uploaded.push(await getDownloadURL(task.snapshot.ref));
  }

  return uploaded;
}
