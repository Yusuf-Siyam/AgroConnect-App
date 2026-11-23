import { randomUUID } from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { env } from '../config/env';
import { HttpError } from '../middleware/error';
import type {
  Product,
  ProductListResponse,
  ProductStatsResponse,
  ProductStatus,
  PublicProduct,
  StockHistoryEntry,
} from '../types/product';
import type {
  CreateProductInput,
  ProductQuery,
  StockAdjustmentInput,
  UpdateProductInput,
} from '../validators/product';
import { getFarmerReputation } from './reputation';

type TimestampLike = { toDate?: () => Date };

const storedProductSchema = z.object({
  id: z.string().min(1),
  sellerId: z.string().min(1),
  name: z.object({ bn: z.string(), en: z.string() }),
  category: z.string(),
  description: z.object({ bn: z.string(), en: z.string() }),
  price: z.number(),
  unit: z.enum(['kg', 'gram', 'mon', 'ton']),
  stock: z.number().int().min(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  minOrderQty: z.number().int().positive(),
  harvestDate: z.string(),
  harvestInfo: z.object({ district: z.string(), variety: z.string() }),
  images: z.array(z.string()).max(5).default([]),
  status: z.enum(['draft', 'active', 'out_of_stock']),
  ratingSummary: z
    .object({ average: z.number(), count: z.number().int().min(0) })
    .default({ average: 0, count: 0 }),
  deleted: z.boolean().default(false),
  deletedAt: z.string().optional(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  }
  throw new Error('Product timestamp is missing or invalid');
}

export function parseStoredProduct(data: unknown): Product {
  const raw = storedProductSchema.parse(data);
  return {
    ...raw,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

/**
 * A client may only attach images stored under its own UID and product id.
 * The URL check is repeated server-side because Storage rules protect uploads,
 * not arbitrary strings submitted in a product document.
 */
export function ownsProductImageUrl(url: string, sellerId: string, productId: string): boolean {
  try {
    const parsed = new URL(url);
    const emulatorHost = env.firebaseStorageEmulatorHost;
    const isLocalEmulatorUrl = Boolean(
      emulatorHost && parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname),
    );
    if (parsed.protocol !== 'https:' && !isLocalEmulatorUrl) return false;
    if (
      !isLocalEmulatorUrl &&
      !/^(firebasestorage\.googleapis\.com|storage\.googleapis\.com)$/i.test(parsed.hostname)
    ) {
      return false;
    }

    let objectPath: string;
    if (parsed.hostname === 'storage.googleapis.com') {
      objectPath = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
      if (env.firebaseStorageBucket && !objectPath.startsWith(`${env.firebaseStorageBucket}/`)) {
        return false;
      }
      if (env.firebaseStorageBucket) {
        objectPath = objectPath.slice(env.firebaseStorageBucket.length + 1);
      }
    } else {
      const encodedPath = parsed.pathname.split('/o/')[1];
      if (!encodedPath) return false;
      objectPath = decodeURIComponent(encodedPath);
      const bucketMatch = parsed.pathname.match(/\/b\/([^/]+)\/o\//);
      if (env.firebaseStorageBucket && bucketMatch?.[1] !== env.firebaseStorageBucket) {
        return false;
      }
    }

    const prefix = `products/${sellerId}/${productId}/`;
    return objectPath.startsWith(prefix) && objectPath.length > prefix.length;
  } catch {
    return false;
  }
}

function assertOwnedImages(images: string[] | undefined, sellerId: string, productId: string): void {
  if (!images) return;
  if (images.some((url) => !ownsProductImageUrl(url, sellerId, productId))) {
    throw new HttpError(
      400,
      'INVALID_IMAGE_URL',
      'Every image URL must belong to this farmer and product in Firebase Storage.',
    );
  }
}

function statusForStock(status: ProductStatus, stock: number): ProductStatus {
  return stock === 0 ? 'out_of_stock' : status;
}

function productsCollection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('products');
}

export async function getProduct(productId: string): Promise<Product | null> {
  const snapshot = await productsCollection().doc(productId).get();
  if (!snapshot.exists || snapshot.get('deleted') === true) return null;
  return parseStoredProduct(snapshot.data());
}

/** Buyer-facing product detail: drafts, deleted and hidden products never leak. */
export async function requirePublicProduct(productId: string): Promise<PublicProduct> {
  const product = await getProduct(productId);
  if (!product || product.status !== 'active' || product.deleted) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }
  const { getActiveEmergencyListingForProduct } = await import('./emergencyListing.js');
  const { getEffectiveProductPrice } = await import('./pricing.js');
  const listing = await getActiveEmergencyListingForProduct(product.id);
  const effective = getEffectiveProductPrice(product, listing);
  return {
    ...product,
    price: effective.unitPrice,
    emergency: listing
      ? {
          id: listing.id,
          discountPercent: listing.discountPercent,
          discountedPrice: listing.discountedPrice,
          expiresAt: listing.expiresAt,
          availableQty: Math.max(0, listing.availableQty - listing.soldQty),
        }
      : undefined,
    reputation: await getFarmerReputation(product.sellerId),
  };
}

export async function requireOwnedProduct(sellerId: string, productId: string): Promise<Product> {
  const product = await getProduct(productId);
  if (!product || product.sellerId !== sellerId) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }
  return product;
}

export async function listProducts(sellerId: string, query: ProductQuery): Promise<ProductListResponse> {
  const collection = productsCollection();
  let firestoreQuery = collection
    .where('sellerId', '==', sellerId)
    .where('deleted', '==', false)
    .orderBy('createdAt', 'desc');
  if (query.status) {
    firestoreQuery = firestoreQuery.where('status', '==', query.status);
  }

  const snapshot = await firestoreQuery.get();
  const needle = query.search?.toLocaleLowerCase();
  const products = snapshot.docs
    .map((document) => parseStoredProduct(document.data()))
    .filter((product) => {
      if (!needle) return true;
      return [product.name.bn, product.name.en, product.category, product.harvestInfo.variety]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle);
    });

  return {
    items: products.slice(query.offset, query.offset + query.limit),
    total: products.length,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getProductStats(sellerId: string): Promise<ProductStatsResponse> {
  const snapshot = await productsCollection()
    .where('sellerId', '==', sellerId)
    .where('deleted', '==', false)
    .get();
  const products = snapshot.docs.map((document) => parseStoredProduct(document.data()));

  return {
    total: products.length,
    draft: products.filter((product) => product.status === 'draft').length,
    active: products.filter((product) => product.status === 'active').length,
    outOfStock: products.filter((product) => product.status === 'out_of_stock').length,
    lowStock: products.filter(
      (product) => product.stock > 0 && product.stock <= product.lowStockThreshold,
    ).length,
  };
}

export function assertImagesForActive(
  status: ProductStatus,
  images: string[] | undefined,
  required = env.productImageRequired,
): void {
  if (required && status === 'active' && (images?.length ?? 0) === 0) {
    throw new HttpError(
      400,
      'PRODUCT_IMAGE_REQUIRED',
      'At least one image is required when a product is active.',
    );
  }
}

export async function createProduct(
  sellerId: string,
  input: CreateProductInput,
): Promise<Product> {
  const productId = input.id ?? randomUUID();
  assertOwnedImages(input.images, sellerId, productId);
  const status = statusForStock(input.status, input.stock);
  assertImagesForActive(status, input.images);

  const reference = productsCollection().doc(productId);
  if ((await reference.get()).exists) {
    throw new HttpError(409, 'PRODUCT_EXISTS', 'A product with this id already exists.');
  }

  const { id: _ignoredId, ...fields } = input;
  const now = FieldValue.serverTimestamp();
  await reference.set({
    ...fields,
    id: productId,
    sellerId,
    status,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  });

  return (await getProduct(productId))!;
}

export async function updateProduct(
  sellerId: string,
  productId: string,
  input: UpdateProductInput,
): Promise<Product> {
  const current = await requireOwnedProduct(sellerId, productId);
  assertOwnedImages(input.images, sellerId, productId);

  const nextStock = input.stock ?? current.stock;
  const nextStatus = statusForStock(input.status ?? current.status, nextStock);
  const nextImages = input.images ?? current.images;
  assertImagesForActive(nextStatus, nextImages);

  await productsCollection()
    .doc(productId)
    .set(
      {
        ...input,
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  return (await getProduct(productId))!;
}

export async function softDeleteProduct(sellerId: string, productId: string): Promise<void> {
  await requireOwnedProduct(sellerId, productId);
  await productsCollection().doc(productId).set(
    {
      deleted: true,
      deletedAt: new Date().toISOString(),
      status: 'draft',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function adjustStock(
  sellerId: string,
  productId: string,
  input: StockAdjustmentInput,
): Promise<Product> {
  const { firestore } = getFirebaseAdmin();
  const productRef = productsCollection().doc(productId);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(productRef);
    if (!snapshot.exists || snapshot.get('deleted') === true || snapshot.get('sellerId') !== sellerId) {
      throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    }

    const previousQuantity = Number(snapshot.get('stock'));
    if (input.quantity < 0) {
      throw new HttpError(400, 'INVALID_STOCK', 'Stock cannot be negative.');
    }

    const currentStatus = snapshot.get('status') as ProductStatus;
    const nextStatus: ProductStatus =
      input.quantity === 0
        ? 'out_of_stock'
        : currentStatus === 'out_of_stock'
          ? 'active'
          : currentStatus;

    transaction.update(productRef, {
      stock: input.quantity,
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const historyRef = productRef.collection('stockHistory').doc();
    transaction.set(historyRef, {
      id: historyRef.id,
      productId,
      sellerId,
      actorId: sellerId,
      previousQuantity,
      newQuantity: input.quantity,
      reason: input.reason,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return (await getProduct(productId))!;
}

export async function listStockHistory(
  sellerId: string,
  productId: string,
  limit = 20,
): Promise<StockHistoryEntry[]> {
  await requireOwnedProduct(sellerId, productId);
  const snapshot = await productsCollection()
    .doc(productId)
    .collection('stockHistory')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      productId: String(data.productId),
      sellerId: String(data.sellerId),
      actorId: String(data.actorId),
      previousQuantity: Number(data.previousQuantity),
      newQuantity: Number(data.newQuantity),
      reason: String(data.reason),
      createdAt: toIsoString(data.createdAt),
      updatedAt: toIsoString(data.updatedAt),
    };
  });
}
