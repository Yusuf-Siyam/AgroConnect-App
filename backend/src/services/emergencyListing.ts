import { randomUUID } from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { advancedFeatures } from '../config/advancedFeatures';
import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import type {
  EmergencyListing,
  EmergencyListingListResponse,
  PublicEmergencyListing,
} from '../types/emergencyListing';
import type {
  CreateEmergencyListingInput,
  EmergencyListingQuery,
  UpdateEmergencyListingInput,
} from '../validators/emergencyListing';
import { notifyUser } from './notifications';
import { parseStoredProduct, requireOwnedProduct } from './product';
import { getEffectiveProductPrice } from './pricing';

type TimestampLike = { toDate?: () => Date };

const storedSchema = z.object({
  id: z.string().min(1),
  farmerId: z.string().min(1),
  productId: z.string().min(1),
  originalPrice: z.number(),
  discountPercent: z.number().int(),
  discountedPrice: z.number(),
  unit: z.enum(['kg', 'gram', 'mon', 'ton']),
  availableQty: z.number().int(),
  soldQty: z.number().int(),
  expiresAt: z.string(),
  status: z.enum(['active', 'expired', 'cancelled', 'sold_out']),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

function toIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const ts = value as TimestampLike;
    if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  }
  throw new Error('Emergency listing timestamp is missing or invalid');
}

function parseStored(data: unknown): EmergencyListing {
  const raw = storedSchema.parse(data);
  return { ...raw, createdAt: toIso(raw.createdAt), updatedAt: toIso(raw.updatedAt) };
}

function collection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('emergencyListings');
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeDiscountedPrice(originalPrice: number, discountPercent: number): number {
  return roundPrice(originalPrice * (1 - discountPercent / 100));
}

function isExpired(listing: EmergencyListing, now = new Date()): boolean {
  return listing.status === 'active' && new Date(listing.expiresAt).getTime() <= now.getTime();
}

export function normalizeEmergencyListing(listing: EmergencyListing, now = new Date()): EmergencyListing {
  if (isExpired(listing, now)) return { ...listing, status: 'expired' };
  if (listing.status === 'active' && listing.availableQty <= listing.soldQty) {
    return { ...listing, status: 'sold_out' };
  }
  return listing;
}

async function persistNormalized(listing: EmergencyListing): Promise<EmergencyListing> {
  const normalized = normalizeEmergencyListing(listing);
  if (normalized.status !== listing.status) {
    await collection().doc(listing.id).set(
      { status: normalized.status, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  return normalized;
}

export async function getActiveEmergencyListingForProduct(
  productId: string,
  now = new Date(),
): Promise<EmergencyListing | null> {
  const snapshot = await collection()
    .where('productId', '==', productId)
    .where('status', '==', 'active')
    .limit(5)
    .get();
  for (const doc of snapshot.docs) {
    const listing = await persistNormalized(parseStored(doc.data()));
    if (listing.status === 'active' && new Date(listing.expiresAt).getTime() > now.getTime()) {
      return listing;
    }
  }
  return null;
}

export async function requireOwnedEmergencyListing(
  farmerId: string,
  listingId: string,
): Promise<EmergencyListing> {
  const snapshot = await collection().doc(listingId).get();
  if (!snapshot.exists || snapshot.get('farmerId') !== farmerId) {
    throw new HttpError(404, 'EMERGENCY_LISTING_NOT_FOUND', 'Emergency listing not found.');
  }
  return persistNormalized(parseStored(snapshot.data()));
}

export async function createEmergencyListing(
  farmerId: string,
  input: CreateEmergencyListingInput,
): Promise<EmergencyListing> {
  const product = await requireOwnedProduct(farmerId, input.productId);
  if (product.status !== 'active' || product.deleted) {
    throw new HttpError(400, 'PRODUCT_UNAVAILABLE', 'Product is not available for emergency listing.');
  }
  if (input.availableQty > product.stock) {
    throw new HttpError(400, 'INSUFFICIENT_STOCK', 'Available quantity exceeds product stock.');
  }

  const { firestore } = getFirebaseAdmin();
  const listingId = randomUUID();
  const listingRef = collection().doc(listingId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.expiresInHours * 60 * 60 * 1000).toISOString();
  const discountedPrice = computeDiscountedPrice(product.price, input.discountPercent);

  await firestore.runTransaction(async (transaction) => {
    const activeSnapshot = await transaction.get(
      collection()
        .where('farmerId', '==', farmerId)
        .where('productId', '==', input.productId)
        .where('status', '==', 'active')
        .limit(1),
    );
    if (!activeSnapshot.empty) {
      const existing = normalizeEmergencyListing(parseStored(activeSnapshot.docs[0].data()), now);
      if (existing.status === 'active') {
        throw new HttpError(409, 'EMERGENCY_LISTING_ACTIVE', 'An active emergency listing already exists for this product.');
      }
    }
    const ts = FieldValue.serverTimestamp();
    transaction.set(listingRef, {
      id: listingId,
      farmerId,
      productId: input.productId,
      originalPrice: product.price,
      discountPercent: input.discountPercent,
      discountedPrice,
      unit: product.unit,
      availableQty: input.availableQty,
      soldQty: 0,
      expiresAt,
      status: 'active',
      createdAt: ts,
      updatedAt: ts,
    });
  });

  await notifyUser(
    farmerId,
    'emergency_listing_created',
    { listingId, productId: input.productId },
    { productId: input.productId, url: `/buyer/product/${input.productId}` },
  ).catch(() => undefined);

  return requireOwnedEmergencyListing(farmerId, listingId);
}

export async function listFarmerEmergencyListings(
  farmerId: string,
  query: EmergencyListingQuery,
): Promise<EmergencyListingListResponse> {
  const snapshot = await collection().where('farmerId', '==', farmerId).orderBy('createdAt', 'desc').get();
  const items = (await Promise.all(snapshot.docs.map((d) => persistNormalized(parseStored(d.data())))))
    .filter((item) => (query.status ? item.status === query.status : true));
  return {
    items: items.slice(query.offset, query.offset + query.limit),
    total: items.length,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function updateEmergencyListing(
  farmerId: string,
  listingId: string,
  input: UpdateEmergencyListingInput,
): Promise<EmergencyListing> {
  const current = await requireOwnedEmergencyListing(farmerId, listingId);
  if (input.status === 'cancelled') {
    if (current.status !== 'active') {
      throw new HttpError(400, 'EMERGENCY_LISTING_NOT_ACTIVE', 'Only active listings can be cancelled.');
    }
    await collection().doc(listingId).set(
      { status: 'cancelled', updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    await notifyUser(
      farmerId,
      'emergency_listing_cancelled',
      { listingId, productId: current.productId },
      { productId: current.productId, url: `/buyer/product/${current.productId}` },
    ).catch(() => undefined);
    return requireOwnedEmergencyListing(farmerId, listingId);
  }

  if (current.status !== 'active') {
    throw new HttpError(400, 'EMERGENCY_LISTING_NOT_ACTIVE', 'Only active listings can be updated.');
  }
  const nextDiscount = input.discountPercent ?? current.discountPercent;
  const nextAvailable = input.availableQty ?? current.availableQty;
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.discountPercent !== undefined) {
    patch.discountPercent = nextDiscount;
    patch.discountedPrice = computeDiscountedPrice(current.originalPrice, nextDiscount);
  }
  if (input.availableQty !== undefined) {
    if (nextAvailable < current.soldQty) {
      throw new HttpError(400, 'EMERGENCY_LISTING_QTY_INVALID', 'Available quantity cannot be below sold quantity.');
    }
    patch.availableQty = nextAvailable;
    if (nextAvailable <= current.soldQty) patch.status = 'sold_out';
  }
  if (input.expiresInHours !== undefined) {
    patch.expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString();
  }
  await collection().doc(listingId).set(patch, { merge: true });
  return requireOwnedEmergencyListing(farmerId, listingId);
}

export async function listPublicEmergencyListings(
  query: EmergencyListingQuery,
): Promise<{ items: PublicEmergencyListing[]; total: number; limit: number; offset: number }> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await collection().where('status', '==', 'active').orderBy('createdAt', 'desc').get();
  const active = (await Promise.all(snapshot.docs.map((d) => persistNormalized(parseStored(d.data())))))
    .filter((item) => item.status === 'active');

  const items = (await Promise.all(active.map(async (listing) => {
    const [productSnap, farmerSnap] = await Promise.all([
      firestore.collection('products').doc(listing.productId).get(),
      firestore.collection('users').doc(listing.farmerId).get(),
    ]);
    if (!productSnap.exists || productSnap.get('deleted') === true) return null;
    const product = parseStoredProduct(productSnap.data());
    if (product.status !== 'active' || product.stock <= 0) return null;
    const farmer = farmerSnap.exists ? farmerSnap.data() : undefined;
    return {
      ...listing,
      productName: product.name,
      productImages: product.images,
      farmerDisplayName:
        (typeof farmer?.displayName === 'string' && farmer.displayName) ||
        (typeof farmer?.name === 'string' && farmer.name) ||
        '',
      district:
        (typeof farmer?.district === 'string' && farmer.district) || product.harvestInfo.district || '',
    } satisfies PublicEmergencyListing;
  }))).filter((item): item is PublicEmergencyListing => item !== null);

  return {
    items: items.slice(query.offset, query.offset + query.limit),
    total: items.length,
    limit: query.limit,
    offset: query.offset,
  };
}

export function getEmergencyPrice(product: { id: string; price: number }, listing: EmergencyListing | null, now = new Date()) {
  return getEffectiveProductPrice(product, listing, now);
}
