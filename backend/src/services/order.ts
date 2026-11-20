import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import { ORDER_STATUSES, type Order, type OrderListResponse, type OrderStatus } from '../types/order';
import type { OrderQuery } from '../validators/order';

type TimestampLike = { toDate?: () => Date };

const storedOrderSchema = z.object({
  id: z.string().min(1),
  buyerId: z.string().min(1),
  sellerIds: z.array(z.string()).default([]),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      sellerId: z.string().min(1),
      name: z.object({ bn: z.string().optional(), en: z.string().optional() }).default({}),
      quantity: z.number().int().positive(),
      unitPrice: z.number().nonnegative(),
      unit: z.string().min(1),
    }),
  ),
  status: z.enum(ORDER_STATUSES),
  totalAmount: z.number().nonnegative(),
  rejectionReason: z.string().optional(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  }
  throw new Error('Order timestamp is missing or invalid');
}

function serializeOrder(data: unknown): Order {
  const raw = storedOrderSchema.parse(data);
  return {
    ...raw,
    sellerIds: raw.sellerIds.length > 0 ? raw.sellerIds : [...new Set(raw.items.map((item) => item.sellerId))],
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

function ordersCollection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('orders');
}

function assertFarmerOwnsOrder(order: Order, sellerId: string): void {
  // Item ownership is authoritative. sellerIds is only a query index.
  if (!order.items.some((item) => item.sellerId === sellerId)) {
    throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
}

function assertPending(order: Order): void {
  if (order.status !== 'pending') {
    throw new HttpError(409, 'INVALID_ORDER_TRANSITION', 'Only pending orders can be accepted or rejected.');
  }
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const snapshot = await ordersCollection().doc(orderId).get();
  return snapshot.exists ? serializeOrder(snapshot.data()) : null;
}

export async function requireFarmerOrder(sellerId: string, orderId: string): Promise<Order> {
  const order = await getOrder(orderId);
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  assertFarmerOwnsOrder(order, sellerId);
  return order;
}

export async function listFarmerOrders(sellerId: string, query: OrderQuery): Promise<OrderListResponse> {
  let firestoreQuery = ordersCollection()
    .where('sellerIds', 'array-contains', sellerId)
    .orderBy('createdAt', 'desc');
  if (query.status) firestoreQuery = firestoreQuery.where('status', '==', query.status);

  const snapshot = await firestoreQuery.get();
  const orders = snapshot.docs.map((document) => serializeOrder(document.data()));
  return {
    items: orders.slice(query.offset, query.offset + query.limit),
    total: orders.length,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function acceptFarmerOrder(sellerId: string, orderId: string): Promise<Order> {
  const { firestore } = getFirebaseAdmin();
  const orderRef = ordersCollection().doc(orderId);
  const now = FieldValue.serverTimestamp();

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const order = serializeOrder(snapshot.data());
    assertFarmerOwnsOrder(order, sellerId);
    assertPending(order);

    const quantities = new Map<string, number>();
    for (const item of order.items) {
      if (item.sellerId !== sellerId) continue;
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    if (quantities.size === 0) {
      throw new HttpError(403, 'FORBIDDEN', 'The order does not contain your products.');
    }

    const productSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (const productId of quantities.keys()) {
      const productSnapshot = await transaction.get(firestore.collection('products').doc(productId));
      if (!productSnapshot.exists || productSnapshot.get('deleted') === true) {
        throw new HttpError(409, 'PRODUCT_UNAVAILABLE', 'An ordered product is no longer available.');
      }
      if (productSnapshot.get('sellerId') !== sellerId) {
        throw new HttpError(403, 'FORBIDDEN', 'The order contains a product owned by another farmer.');
      }
      const available = Number(productSnapshot.get('stock'));
      const required = quantities.get(productId)!;
      if (!Number.isFinite(available) || available < required) {
        throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Not enough stock to accept this order.');
      }
      productSnapshots.set(productId, productSnapshot);
    }

    for (const [productId, required] of quantities) {
      const productSnapshot = productSnapshots.get(productId)!;
      const previousQuantity = Number(productSnapshot.get('stock'));
      const newQuantity = previousQuantity - required;
      const productRef = firestore.collection('products').doc(productId);
      transaction.update(productRef, {
        stock: newQuantity,
        status: newQuantity === 0 ? 'out_of_stock' : productSnapshot.get('status'),
        updatedAt: now,
      });

      const historyRef = productRef.collection('stockHistory').doc();
      transaction.set(historyRef, {
        id: historyRef.id,
        productId,
        sellerId,
        actorId: sellerId,
        previousQuantity,
        newQuantity,
        reason: `Order ${orderId} accepted`,
        createdAt: now,
        updatedAt: now,
      });
    }

    transaction.update(orderRef, {
      status: 'accepted' satisfies OrderStatus,
      acceptedBy: sellerId,
      acceptedAt: now,
      updatedAt: now,
    });
  });

  return (await getOrder(orderId))!;
}

export async function rejectFarmerOrder(
  sellerId: string,
  orderId: string,
  reason: string,
): Promise<Order> {
  const { firestore } = getFirebaseAdmin();
  const orderRef = ordersCollection().doc(orderId);
  const now = FieldValue.serverTimestamp();

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const order = serializeOrder(snapshot.data());
    assertFarmerOwnsOrder(order, sellerId);
    assertPending(order);

    transaction.update(orderRef, {
      status: 'rejected' satisfies OrderStatus,
      rejectionReason: reason,
      rejectedBy: sellerId,
      rejectedAt: now,
      updatedAt: now,
    });
  });

  return (await getOrder(orderId))!;
}
