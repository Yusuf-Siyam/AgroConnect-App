import { v2 as cloudinary } from 'cloudinary';

import { env } from '../config/env';
import { HttpError } from '../middleware/error';

export type CloudinaryUploadPurpose = 'product' | 'diagnosis';

export type CloudinarySignInput = {
  purpose: CloudinaryUploadPurpose;
  uid: string;
  productId?: string;
};

export type CloudinarySignedUpload = {
  provider: 'cloudinary';
  purpose: CloudinaryUploadPurpose;
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

export type CloudinaryAsset = {
  publicId: string;
  resourceType: 'image';
  deliveryType: 'upload' | 'authenticated';
  version?: number;
  format?: string;
};

export interface CloudinaryService {
  isConfigured(): boolean;
  assertConfigured(): void;
  createSignedUpload(input: CloudinarySignInput): CloudinarySignedUpload;
  buildDeliveryUrl(asset: CloudinaryAsset): string;
  readAsset(asset: CloudinaryAsset): Promise<{ data: Buffer; mimeType: string }>;
  deleteAsset(asset: CloudinaryAsset): Promise<void>;
  assertOwnedAsset(asset: CloudinaryAsset, uid: string, purpose: CloudinaryUploadPurpose, productId?: string): void;
  parseOwnedDeliveryUrl(url: string, uid: string, purpose: CloudinaryUploadPurpose, productId?: string): CloudinaryAsset;
}

const SIGN_TTL_SECONDS = 5 * 60;
const DELIVERY_TTL_SECONDS = 5 * 60;

function folderFor(input: CloudinarySignInput): string {
  if (input.purpose === 'product') {
    if (!input.productId) throw new HttpError(400, 'VALIDATION_ERROR', 'productId is required for product uploads.');
    return `agroconnect/products/${input.uid}/${input.productId}`;
  }
  return `agroconnect/diagnoses/${input.uid}`;
}

function ensureConfigured(): void {
  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    throw new HttpError(503, 'CLOUDINARY_NOT_CONFIGURED', 'Cloudinary is not configured on the backend.');
  }
}

function configureSdk(): void {
  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true,
  });
}

function assertOwnedPublicId(publicId: string, uid: string, purpose: CloudinaryUploadPurpose, productId?: string): void {
  const folder = folderFor({ purpose, uid, ...(productId ? { productId } : {}) });
  const normalized = publicId.trim();
  if (!normalized.startsWith(`${folder}/`) || normalized.length <= folder.length + 1) {
    throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'The image asset must belong to the authenticated user.');
  }
  if (normalized.includes('..') || normalized.includes('\\')) {
    throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'The image asset path is invalid.');
  }
}

export function createCloudinaryService(): CloudinaryService {
  return {
    isConfigured() {
      return Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);
    },
    assertConfigured() {
      ensureConfigured();
    },
    createSignedUpload(input) {
      ensureConfigured();
      configureSdk();
      const folder = folderFor(input);
      const timestamp = Math.floor(Date.now() / 1000);
      const deliveryType = input.purpose === 'diagnosis' ? 'authenticated' : 'upload';
      const paramsToSign: Record<string, string | number> = {
        folder,
        timestamp,
      };
      if (deliveryType === 'authenticated') {
        paramsToSign.type = 'authenticated';
      }
      const signature = cloudinary.utils.api_sign_request(paramsToSign, env.cloudinaryApiSecret);
      return {
        provider: 'cloudinary',
        purpose: input.purpose,
        cloudName: env.cloudinaryCloudName,
        apiKey: env.cloudinaryApiKey,
        timestamp,
        signature,
        folder,
        resourceType: 'image',
        deliveryType,
        signedParams: paramsToSign,
        uploadUrl: `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/image/upload`,
        expiresAt: new Date((timestamp + SIGN_TTL_SECONDS) * 1000).toISOString(),
      };
    },
    buildDeliveryUrl(asset) {
      ensureConfigured();
      configureSdk();
      if (asset.deliveryType === 'authenticated') {
        return cloudinary.url(asset.publicId, {
          resource_type: asset.resourceType,
          type: 'authenticated',
          secure: true,
          sign_url: true,
          ...(asset.version ? { version: asset.version } : {}),
          ...(asset.format ? { format: asset.format } : {}),
        });
      }
      return cloudinary.url(asset.publicId, {
        resource_type: asset.resourceType,
        type: 'upload',
        secure: true,
        ...(asset.version ? { version: asset.version } : {}),
        ...(asset.format ? { format: asset.format } : {}),
      });
    },
    async readAsset(asset) {
      ensureConfigured();
      const url = this.buildDeliveryUrl(asset);
      let response: Response;
      try {
        response = await fetch(url);
      } catch {
        throw new HttpError(404, 'IMAGE_NOT_FOUND', 'The uploaded image was not found.');
      }
      if (!response.ok) {
        throw new HttpError(404, 'IMAGE_NOT_FOUND', 'The uploaded image was not found.');
      }
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
      const mimeType = contentType || 'image/jpeg';
      const data = Buffer.from(await response.arrayBuffer());
      return { data, mimeType };
    },
    async deleteAsset(asset) {
      ensureConfigured();
      configureSdk();
      await cloudinary.uploader.destroy(asset.publicId, {
        resource_type: asset.resourceType,
        type: asset.deliveryType,
        invalidate: true,
      });
    },
    assertOwnedAsset(asset, uid, purpose, productId) {
      if (asset.resourceType !== 'image') {
        throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'Only image assets are supported.');
      }
      if (purpose === 'diagnosis' && asset.deliveryType !== 'authenticated') {
        throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'Diagnosis images must be authenticated assets.');
      }
      if (purpose === 'product' && asset.deliveryType !== 'upload') {
        throw new HttpError(400, 'INVALID_IMAGE_ASSET', 'Product images must be public upload assets.');
      }
      assertOwnedPublicId(asset.publicId, uid, purpose, productId);
    },
    parseOwnedDeliveryUrl(url, uid, purpose, productId) {
      ensureConfigured();
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new HttpError(400, 'INVALID_IMAGE_URL', 'Image URL is invalid.');
      }
      if (parsed.protocol !== 'https:') {
        throw new HttpError(400, 'INVALID_IMAGE_URL', 'Image URL must use HTTPS.');
      }
      const host = parsed.hostname.toLowerCase();
      if (host !== 'res.cloudinary.com') {
        throw new HttpError(400, 'INVALID_IMAGE_URL', 'Image URL host is not allowed.');
      }
      const segments = parsed.pathname.split('/').filter(Boolean);
      // /{cloud}/image/{upload|authenticated}/.../v123/folder/file.ext
      const [cloud, resourceType, deliveryType, ...rest] = segments;
      if (cloud !== env.cloudinaryCloudName) {
        throw new HttpError(400, 'INVALID_IMAGE_URL', 'Image URL cloud name is not allowed.');
      }
      if (resourceType !== 'image' || (deliveryType !== 'upload' && deliveryType !== 'authenticated')) {
        throw new HttpError(400, 'INVALID_IMAGE_URL', 'Image URL type is not allowed.');
      }
      const versionIndex = rest.findIndex((s) => /^v\d+$/.test(s));
      const publicSegments = versionIndex >= 0 ? rest.slice(versionIndex + 1) : rest;
      if (publicSegments.length === 0) {
        throw new HttpError(400, 'INVALID_IMAGE_URL', 'Image URL is missing an asset id.');
      }
      const last = publicSegments[publicSegments.length - 1]!;
      const dot = last.lastIndexOf('.');
      const format = dot > 0 ? last.slice(dot + 1).toLowerCase() : undefined;
      const publicId = [...publicSegments.slice(0, -1), dot > 0 ? last.slice(0, dot) : last].join('/');
      const asset: CloudinaryAsset = {
        publicId,
        resourceType: 'image',
        deliveryType,
        ...(versionIndex >= 0 ? { version: Number(rest[versionIndex]!.slice(1)) } : {}),
        ...(format ? { format } : {}),
      };
      this.assertOwnedAsset(asset, uid, purpose, productId);
      return asset;
    },
  };
}

let activeCloudinaryService: CloudinaryService = createCloudinaryService();

export function getCloudinaryService(): CloudinaryService {
  return activeCloudinaryService;
}

export function setCloudinaryService(service: CloudinaryService): void {
  activeCloudinaryService = service;
}

export function resetCloudinaryService(): void {
  activeCloudinaryService = createCloudinaryService();
}
