import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import type { CartItem, CartResponse } from '../types/buyerState';
import type { Product } from '../types/product';
import type { AddCartItemInput, UpdateCartItemInput } from '../validators/buyerState';
import { getActiveEmergencyListingForProduct } from './emergencyListing';
import { parseStoredProduct } from './product';
import { getEffectiveProductPrice } from './pricing';

const storedCartItemSchema = z.object({
  productId: z.string(),
  sellerId: z.string(),
  name: z.object({ bn: z.string(), en: z.string() }),
  imageUrl: z.string().optional(),
  unit: z.enum(['kg', 'gram', 'mon', 'ton']),
  quantity: z.number().int().positive(),
  minOrderQty: z.number().int().positive(),
  stock: z.number().int().min(0),
  price: z.number(),
  addedAt: z.unknown().optional(),
});

type StoredCartItem = z.infer<typeof storedCartItemSchema>;

function toIsoString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as { toDate?: () => Date };
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  }
  return undefined;
}

function cartsCollection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('carts');
}

function cartDoc(buyerId: string) {
  return cartsCollection().doc(buyerId);
}

function storedItems(data: unknown): StoredCartItem[] {
  const raw = data as { items?: unknown } | undefined;
  if (!Array.isArray(raw?.items)) return [];
  return raw.items.flatMap((item) => {
    const parsed = storedCartItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function snapshotFor(product: Product, quantity: number): StoredCartItem {
  const imageUrl = product.images[0];
  return {
    productId: product.id,
    sellerId: product.sellerId,
    name: product.name,
    ...(imageUrl ? { imageUrl } : {}),
    unit: product.unit,
    quantity,
    minOrderQty: product.minOrderQty,
    stock: product.stock,
    price: product.price,
    addedAt: new Date().toISOString(),
  };
}

function assertPurchasable(product: Product | null, buyerId: string): Product {
  if (!product) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  if (product.sellerId === buyerId) {
    throw new HttpError(400, 'OWN_PRODUCT', 'You cannot add your own product to the cart.');
  }
  if (product.status !== 'active' || product.deleted || product.stock <= 0) {
    throw new HttpError(400, 'PRODUCT_UNAVAILABLE', 'This product is not available.');
  }
  return product;
}

function assertQuantity(product: Product, quantity: number): void {
  if (quantity < product.minOrderQty) {
    throw new HttpError(
      400,
      'MIN_ORDER_QTY',
      `Minimum order quantity is ${product.minOrderQty}.`,
    );
  }
  if (quantity > product.stock) {
    throw new HttpError(400, 'INSUFFICIENT_STOCK', 'Not enough stock is available.');
  }
}

async function toCartItem(stored: StoredCartItem, buyerId: string): Promise<CartItem> {
  const productSnapshot = await cartsCollection().firestore
    .collection('products')
    .doc(stored.productId)
    .get();

  if (!productSnapshot.exists || productSnapshot.get('deleted') === true) {
    return {
      productId: stored.productId,
      sellerId: stored.sellerId,
      name: stored.name,
      ...(stored.imageUrl ? { imageUrl: stored.imageUrl } : {}),
      unit: stored.unit,
      quantity: stored.quantity,
      minOrderQty: stored.minOrderQty,
      stock: stored.stock,
      unitPrice: stored.price,
      baseUnitPrice: stored.price,
      priceSource: 'base',
      lineTotal: stored.price * stored.quantity,
      available: false,
      unavailableReason: 'PRODUCT_NOT_FOUND',
    };
  }

  const product = parseStoredProduct(productSnapshot.data());
  const emergency = await getActiveEmergencyListingForProduct(product.id);
  const effective = getEffectiveProductPrice(product, emergency);

  if (product.sellerId === buyerId) {
    return {
      productId: stored.productId,
      sellerId: stored.sellerId,
      name: stored.name,
      ...(stored.imageUrl ? { imageUrl: stored.imageUrl } : {}),
      unit: stored.unit,
      quantity: stored.quantity,
      minOrderQty: stored.minOrderQty,
      stock: stored.stock,
      unitPrice: effective.unitPrice,
      baseUnitPrice: effective.baseUnitPrice,
      ...(effective.emergencyListingId ? { emergencyListingId: effective.emergencyListingId } : {}),
      ...(effective.discountPercent !== undefined ? { discountPercent: effective.discountPercent } : {}),
      priceSource: effective.priceSource,
      lineTotal: effective.unitPrice * stored.quantity,
      available: false,
      unavailableReason: 'OWN_PRODUCT',
    };
  }
  if (product.status !== 'active' || product.stock <= 0) {
    return {
      productId: product.id,
      sellerId: product.sellerId,
      name: product.name,
      ...(product.images[0] ? { imageUrl: product.images[0] } : {}),
      unit: product.unit,
      quantity: stored.quantity,
      minOrderQty: product.minOrderQty,
      stock: product.stock,
      unitPrice: effective.unitPrice,
      baseUnitPrice: effective.baseUnitPrice,
      ...(effective.emergencyListingId ? { emergencyListingId: effective.emergencyListingId } : {}),
      ...(effective.discountPercent !== undefined ? { discountPercent: effective.discountPercent } : {}),
      priceSource: effective.priceSource,
      lineTotal: effective.unitPrice * stored.quantity,
      available: false,
      unavailableReason: 'PRODUCT_UNAVAILABLE',
    };
  }

  return {
    productId: product.id,
    sellerId: product.sellerId,
    name: product.name,
    ...(product.images[0] ? { imageUrl: product.images[0] } : {}),
    unit: product.unit,
    quantity: stored.quantity,
    minOrderQty: product.minOrderQty,
    stock: product.stock,
    unitPrice: effective.unitPrice,
    baseUnitPrice: effective.baseUnitPrice,
    ...(effective.emergencyListingId ? { emergencyListingId: effective.emergencyListingId } : {}),
    ...(effective.discountPercent !== undefined ? { discountPercent: effective.discountPercent } : {}),
    priceSource: effective.priceSource,
    lineTotal: effective.unitPrice * stored.quantity,
    available: true,
  };
}

export async function getCart(buyerId: string): Promise<CartResponse> {
  const snapshot = await cartDoc(buyerId).get();
  const items = await Promise.all(storedItems(snapshot.data()).map((item) => toCartItem(item, buyerId)));
  return {
    items,
    total: items.length,
    farmerCount: new Set(items.map((item) => item.sellerId)).size,
    updatedAt: toIsoString(snapshot.data()?.updatedAt),
  };
}

export async function addCartItem(buyerId: string, input: AddCartItemInput): Promise<CartResponse> {
  const { firestore } = getFirebaseAdmin();
  const cartRef = cartDoc(buyerId);

  await firestore.runTransaction(async (transaction) => {
    const [cartSnapshot, productSnapshot] = await Promise.all([
      transaction.get(cartRef),
      transaction.get(firestore.collection('products').doc(input.productId)),
    ]);
    const product = productSnapshot.exists ? parseStoredProduct(productSnapshot.data()) : null;
    const purchasable = assertPurchasable(product, buyerId);

    const items = storedItems(cartSnapshot.data());
    const index = items.findIndex((item) => item.productId === input.productId);
    const quantity = index >= 0 ? items[index]!.quantity + input.quantity : input.quantity;
    assertQuantity(purchasable, quantity);

    const nextItem = snapshotFor(purchasable, quantity);
    if (index >= 0) items[index] = nextItem;
    else items.push(nextItem);

    transaction.set(
      cartRef,
      {
        ownerId: buyerId,
        items,
        createdAt:
          (cartSnapshot.exists ? cartSnapshot.get('createdAt') : undefined) ??
          FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return getCart(buyerId);
}

export async function updateCartItem(
  buyerId: string,
  productId: string,
  input: UpdateCartItemInput,
): Promise<CartResponse> {
  const { firestore } = getFirebaseAdmin();
  const cartRef = cartDoc(buyerId);

  await firestore.runTransaction(async (transaction) => {
    const [cartSnapshot, productSnapshot] = await Promise.all([
      transaction.get(cartRef),
      transaction.get(firestore.collection('products').doc(productId)),
    ]);
    const product = productSnapshot.exists ? parseStoredProduct(productSnapshot.data()) : null;
    const purchasable = assertPurchasable(product, buyerId);
    assertQuantity(purchasable, input.quantity);

    const items = storedItems(cartSnapshot.data());
    const index = items.findIndex((item) => item.productId === productId);
    if (index < 0) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Cart item not found.');
    items[index] = snapshotFor(purchasable, input.quantity);

    transaction.set(
      cartRef,
      { ownerId: buyerId, items, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });

  return getCart(buyerId);
}

export async function removeCartItem(buyerId: string, productId: string): Promise<CartResponse> {
  const { firestore } = getFirebaseAdmin();
  const cartRef = cartDoc(buyerId);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(cartRef);
    const items = storedItems(snapshot.data()).filter((item) => item.productId !== productId);
    transaction.set(
      cartRef,
      { ownerId: buyerId, items, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });

  return getCart(buyerId);
}

export async function clearCart(buyerId: string): Promise<CartResponse> {
  await cartDoc(buyerId).delete();
  return { items: [], total: 0, farmerCount: 0 };
}
