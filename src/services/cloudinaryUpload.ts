import { api, assertApiConfigured, toApiError } from '@/services/api';

export type UploadPurpose = 'product' | 'diagnosis';

export type SignedUpload = {
  provider: 'cloudinary';
  purpose: UploadPurpose;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  resourceType: 'image';
  deliveryType: 'upload' | 'authenticated';
  signedParams: Record<string, string | number>;
  uploadUrl: string;
  expiresAt: string;
};

export type UploadConfig = { provider: 'cloudinary'; enabled: boolean };

export async function getUploadConfig(): Promise<UploadConfig> {
  assertApiConfigured();
  try {
    return (await api.get<UploadConfig>('/api/uploads/config')).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function signUpload(input: { purpose: 'product'; productId: string } | { purpose: 'diagnosis' }): Promise<SignedUpload> {
  assertApiConfigured();
  try {
    return (await api.post<SignedUpload>('/api/uploads/sign', input)).data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function uploadToCloudinary(
  file: Blob,
  signed: SignedUpload,
  onProgress?: (fraction: number) => void,
): Promise<{ secureUrl: string; publicId: string; version: number; format: string }> {
  const body = new FormData();
  body.append('file', file);
  body.append('api_key', signed.apiKey);
  body.append('timestamp', String(signed.timestamp));
  body.append('signature', signed.signature);
  body.append('folder', signed.folder);
  if (signed.deliveryType === 'authenticated') body.append('type', 'authenticated');

  const json = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', signed.uploadUrl);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new Error('CLOUDINARY_UPLOAD_FAILED'));
    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(parsed);
        else reject(Object.assign(new Error(parsed?.error?.message ?? 'CLOUDINARY_UPLOAD_FAILED'), { code: 'CLOUDINARY_UPLOAD_FAILED' }));
      } catch {
        reject(new Error('CLOUDINARY_UPLOAD_FAILED'));
      }
    };
    xhr.send(body);
  });

  return {
    secureUrl: String(json.secure_url),
    publicId: String(json.public_id),
    version: Number(json.version),
    format: String(json.format ?? 'jpg'),
  };
}
