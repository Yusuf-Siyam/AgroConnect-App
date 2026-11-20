import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import type { WishlistResponse } from '../types/buyerState';
import type { WishlistQuery } from '../validators/buyerState';
import { parseStoredProduct } from './product';

const storedWishlistSchema = z.object({
  ownerId: z.string(),
  productIds: z.array(z.string()),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

function wishlistDoc(buyerId: string) {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('wishlists').doc(buyerId);
}

export async function getWishlist(buyerId: string, query: WishlistQuery): Promise<WishlistResponse> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await wishlistDoc(buyerId).get();
  const stored = storedWishlistSchema.safeParse(snapshot.data());
  const ids = stored.success ? [...new Set(stored.data.productIds)] : [];

  const visible = await Promise.all(
    ids.map(async (id) => {
      const productSnapshot = await firestore.collection('products').doc(id).get();
      if (!productSnapshot.exists || productSnapshot.get('deleted') === true) return null;
      const product = parseStoredProduct(productSnapshot.data());
      if (product.status !== 'active' || product.stock <= 0) return null;
      return product;
    }),
  );

  const items = visible.filter((item) => item !== null);
  return {
    items: items.slice(query.offset, query.offset + query.limit),
    total: items.length,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function addWishlistItem(buyerId: string, productId: string): Promise<void> {
  const { firestore } = getFirebaseAdmin();
  const wishlistRef = wishlistDoc(buyerId);
  const productSnapshot = await firestore.collection('products').doc(productId).get();
  if (!productSnapshot.exists || productSnapshot.get('deleted') === true) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }
  const product = parseStoredProduct(productSnapshot.data());
  if (product.status !== 'active' || product.stock <= 0 || product.sellerId === buyerId) {
    throw new HttpError(400, 'PRODUCT_UNAVAILABLE', 'This product is not available.');
  }

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(wishlistRef);
    const stored = storedWishlistSchema.safeParse(snapshot.data());
    const ids = stored.success ? stored.data.productIds : [];
    if (ids.includes(productId)) {
      throw new HttpError(409, 'DUPLICATE_WISHLIST', 'This product is already in your wishlist.');
    }

    transaction.set(
      wishlistRef,
      {
        ownerId: buyerId,
        productIds: [...ids, productId],
        createdAt: snapshot.exists ? snapshot.get('createdAt') : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

export async function removeWishlistItem(buyerId: string, productId: string): Promise<void> {
  const { firestore } = getFirebaseAdmin();
  const wishlistRef = wishlistDoc(buyerId);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(wishlistRef);
    const stored = storedWishlistSchema.safeParse(snapshot.data());
    const ids = stored.success ? stored.data.productIds.filter((id) => id !== productId) : [];
    transaction.set(
      wishlistRef,
      { ownerId: buyerId, productIds: ids, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });
}
