import { createHmac } from 'node:crypto';

import { HttpError } from '../middleware/error';
import type { CloudinaryAsset, CloudinaryService, CloudinarySignInput, CloudinarySignedUpload } from './cloudinary';

type CloudinaryTestState = {
  deleted: CloudinaryAsset[];
  failDelete: boolean;
  cloudName: string;
};

export function createCloudinaryTestService(state: CloudinaryTestState): CloudinaryService {
  function folderFor(input: CloudinarySignInput): string {
    if (input.purpose === 'product') {
      if (!input.productId) throw new HttpError(400, 'VALIDATION_ERROR', 'productId required');
      return `agroconnect/products/${input.uid}/${input.productId}`;
    }
    return `agroconnect/diagnoses/${input.uid}`;
  }

  function assertOwned(asset: CloudinaryAsset, uid: string, purpose: 'product' | 'diagnosis', productId?: string): void {
    const folder = folderFor({ purpose, uid, ...(productId ? { productId } : {}) });
    if (asset.resourceType !== 'image') throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'invalid resourceType');
    if (purpose === 'diagnosis' && asset.deliveryType !== 'authenticated') {
      throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'diagnosis must be authenticated');
    }
    if (purpose === 'product' && asset.deliveryType !== 'upload') {
      throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'product must be upload');
    }
    if (!asset.publicId.startsWith(`${folder}/`)) {
      throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'not owned');
    }
  }

  return {
    isConfigured() {
      return true;
    },
    assertConfigured() {},
    createSignedUpload(input) {
      const folder = folderFor(input);
      const timestamp = 1700000000;
      const deliveryType = input.purpose === 'diagnosis' ? 'authenticated' : 'upload';
      const signedParams: Record<string, string | number> = { folder, timestamp };
      if (deliveryType === 'authenticated') signedParams.type = 'authenticated';
      const signature = createHmac('sha1', 'test-secret').update(JSON.stringify(signedParams)).digest('hex');
      const signed: CloudinarySignedUpload = {
        provider: 'cloudinary',
        purpose: input.purpose,
        cloudName: state.cloudName,
        apiKey: 'test-api-key',
        timestamp,
        signature,
        folder,
        resourceType: 'image',
        deliveryType,
        signedParams,
        uploadUrl: `https://api.cloudinary.com/v1_1/${state.cloudName}/image/upload`,
        expiresAt: new Date((timestamp + 300) * 1000).toISOString(),
      };
      return signed;
    },
    buildDeliveryUrl(asset) {
      const v = asset.version ? `/v${asset.version}` : '';
      const ext = asset.format ? `.${asset.format}` : '';
      return `https://res.cloudinary.com/${state.cloudName}/image/${asset.deliveryType}${v}/${asset.publicId}${ext}?sig=test`;
    },
    async readAsset(_asset) {
      // Minimal JPEG magic bytes; this is a test double, not a real image.
      return { data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), mimeType: 'image/jpeg' };
    },
    async deleteAsset(asset) {
      if (state.failDelete) throw new Error('simulated cloudinary delete failure');
      state.deleted.push(asset);
    },
    assertOwnedAsset(asset, uid, purpose, productId) {
      assertOwned(asset, uid, purpose, productId);
    },
    parseOwnedDeliveryUrl(url, uid, purpose, productId) {
      const parsed = new URL(url);
      if (parsed.hostname !== 'res.cloudinary.com') throw new Error('bad host');
      const [cloud, resourceType, deliveryType, ...rest] = parsed.pathname.split('/').filter(Boolean);
      if (cloud !== state.cloudName) throw new Error('bad cloud');
      const versionIndex = rest.findIndex((s) => /^v\d+$/.test(s));
      const publicSegments = versionIndex >= 0 ? rest.slice(versionIndex + 1) : rest;
      const last = publicSegments[publicSegments.length - 1] ?? '';
      const dot = last.lastIndexOf('.');
      const format = dot > 0 ? last.slice(dot + 1).toLowerCase() : undefined;
      const publicId = [...publicSegments.slice(0, -1), dot > 0 ? last.slice(0, dot) : last].join('/');
      const asset: CloudinaryAsset = {
        publicId,
        resourceType: resourceType as 'image',
        deliveryType: deliveryType as 'upload' | 'authenticated',
        ...(versionIndex >= 0 ? { version: Number(rest[versionIndex]!.slice(1)) } : {}),
        ...(format ? { format } : {}),
      };
      assertOwned(asset, uid, purpose, productId);
      return asset;
    },
  };
}
