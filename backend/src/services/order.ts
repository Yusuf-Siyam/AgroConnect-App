import { createHash, randomUUID } from 'node:crypto';

import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import { parseStoredProduct } from './product';
import { recomputeFarmerReputationsForOrder } from './reputation';
import {
  assertAllowedOrderTransition,
  assertApiMutableOrderStatus,
  notifyOrderTransition,
  ORDER_STATUSES,
  type OrderStatus,
} from './orderStatus';
import type {
  DeliveryAddress,
  Order,
  OrderCheckoutResponse,
  OrderListResponse,
  OrderStatusEvent,
} from '../types/order';
import type { CreateOrderInput, OrderQuery } from '../validators/order';

type TimestampLike = { toDate?: () => Date };
type ActorRole = 'farmer' | 'buyer' | 'admin' | 'system' | 'transporter';

const deliveryAddressSchema = z
  .object({
    addressLine: z.string(),
    district: z.string(),
    phoneNumber: z.string(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })
  .strict();

const pickupAddressSchema = z
  .object({
    addressLine: z.string().optional(),
    district: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })
  .strict();

const statusEventSchema = z
  .object({
    id: z.string(),
    from: z.enum(ORDER_STATUSES).nullable(),
    to: z.enum(ORDER_STATUSES),
    actorId: z.string(),
    actorRole: z.string(),
    reason: z.string().optional(),
    stockAdjusted: z.boolean().optional(),
    createdAt: z.unknown(),
    updatedAt: z.unknown(),
  })
  .passthrough();

const storedOrderSchema = z
  .object({
    id: z.string().min(1),
    buyerId: z.string().min(1),
    sellerIds: z.array(z.string()).default([]),
    transporterId: z.string().optional(),
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
    deliveryFee: z.number().nullable().default(null),
    pickupAddress: pickupAddressSchema.optional(),
    deliveryAddress: deliveryAddressSchema.optional(),
    rejectionReason: z.string().optional(),
    stockAdjusted: z.boolean().optional(),
    stockRestored: z.boolean().optional(),
    statusHistory: z.array(statusEventSchema).default([]),
    createdAt: z.unknown(),
    updatedAt: z.unknown(),
  })
  .passthrough();

const storedCartSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1),
            sellerId: z.string().min(1),
            quantity: z.number().int().positive(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

const checkoutDocSchema = z
  .object({
    buyerId: z.string(),
    checkoutId: z.string(),
    orderIds: z.array(z.string()),
  })
  .passthrough();

type StoredCartItem = z.infer<typeof storedCartSchema>['items'][number];

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  }
  throw new Error('Order timestamp is missing or invalid');
}

function serializeStatusEvent(value: z.infer<typeof statusEventSchema>): OrderStatusEvent {
  return {
    ...value,
    createdAt: toIsoString(value.createdAt),
    updatedAt: toIsoString(value.updatedAt),
  };
}

function serializeOrder(data: unknown): Order {
  const raw = storedOrderSchema.parse(data);
  return {
    id: raw.id,
    buyerId: raw.buyerId,
    sellerIds:
      raw.sellerIds.length > 0 ? raw.sellerIds : [...new Set(raw.items.map((item) => item.sellerId))],
    ...(raw.transporterId ? { transporterId: raw.transporterId } : {}),
    items: raw.items,
    status: raw.status,
    totalAmount: raw.totalAmount,
    deliveryFee: raw.deliveryFee,
    ...(raw.pickupAddress ? { pickupAddress: raw.pickupAddress } : {}),
    ...(raw.deliveryAddress ? { deliveryAddress: raw.deliveryAddress } : {}),
    ...(raw.rejectionReason ? { rejectionReason: raw.rejectionReason } : {}),
    ...(raw.stockAdjusted === undefined ? {} : { stockAdjusted: raw.stockAdjusted }),
    ...(raw.stockRestored === undefined ? {} : { stockRestored: raw.stockRestored }),
    statusHistory: raw.statusHistory.map(serializeStatusEvent),
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

function ordersCollection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('orders');
}

/** Side-effect hooks run only after a committed transaction and are non-fatal. */
async function safeNotifyOrder(order: Order, status: OrderStatus, role: ActorRole): Promise<void> {
  try {
    await notifyOrderTransition(order, status, role);
  } catch (error) {
    console.error('[order] notification hook failed (non-fatal)', error);
  }
  if (status === 'rejected' || status === 'cancelled' || status === 'delivered') {
    await recomputeFarmerReputationsForOrder(order);
  }
}

export { createStatusEvent, ordersCollection, serializeOrder };

function checkoutsCollection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('orderCheckouts');
}

function cartDoc(buyerId: string) {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('carts').doc(buyerId);
}

function productDoc(productId: string) {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('products').doc(productId);
}

function hashId(...parts: string[]): string {
  return createHash('sha256').update(parts.join(':')).digest('hex');
}

function checkoutDocId(buyerId: string, checkoutId: string): string {
  return hashId('checkout', buyerId, checkoutId);
}

function orderDocId(buyerId: string, checkoutId: string, sellerId: string): string {
  return hashId('order', buyerId, checkoutId, sellerId);
}

function createStatusEvent(input: {
  from: OrderStatus | null;
  to: OrderStatus;
  actorId: string;
  actorRole: ActorRole;
  at: string;
  reason?: string;
  stockAdjusted?: boolean;
}): OrderStatusEvent {
  return {
    id: randomUUID(),
    from: input.from,
    to: input.to,
    actorId: input.actorId,
    actorRole: input.actorRole,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.stockAdjusted === undefined ? {} : { stockAdjusted: input.stockAdjusted }),
    createdAt: input.at,
    updatedAt: input.at,
  };
}

function assertFarmerOwnsOrder(order: Order, sellerId: string): void {
  // Item ownership is authoritative. sellerIds is only a query index.
  if (!order.items.some((item) => item.sellerId === sellerId)) {
    throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
}

function assertBuyerOwnsOrder(order: Order, buyerId: string): void {
  if (order.buyerId !== buyerId) {
    throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  }
}

function assertVisibleOrder(order: Order, uid: string, role: string): void {
  if (role === 'admin') return;
  if (role === 'buyer' && order.buyerId === uid) return;
  if (role === 'farmer' && order.sellerIds.includes(uid)) return;
  if (role === 'transporter' && order.transporterId === uid) return;
  throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
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

export async function requireBuyerOrder(buyerId: string, orderId: string): Promise<Order> {
  const order = await getOrder(orderId);
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  assertBuyerOwnsOrder(order, buyerId);
  return order;
}

export async function requireVisibleOrder(
  uid: string,
  role: string,
  orderId: string,
): Promise<Order> {
  const order = await getOrder(orderId);
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  assertVisibleOrder(order, uid, role);
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

export async function listBuyerOrders(buyerId: string, query: OrderQuery): Promise<OrderListResponse> {
  let firestoreQuery = ordersCollection()
    .where('buyerId', '==', buyerId)
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

async function checkoutResponseFrom(data: DocumentData, buyerId: string): Promise<OrderCheckoutResponse> {
  const parsed = checkoutDocSchema.parse(data);
  if (parsed.buyerId !== buyerId) {
    throw new HttpError(403, 'FORBIDDEN', 'This checkout belongs to another buyer.');
  }

  const orders = await Promise.all(parsed.orderIds.map((orderId) => getOrder(orderId)));
  if (orders.some((order) => order === null)) {
    throw new Error('Checkout references a missing order');
  }

  return {
    checkoutId: parsed.checkoutId,
    orders: orders as Order[],
    orderIds: parsed.orderIds,
    farmerCount: new Set((orders as Order[]).flatMap((order) => order.sellerIds)).size,
    itemCount: (orders as Order[]).reduce((sum, order) => sum + order.items.length, 0),
    totalAmount: (orders as Order[]).reduce((sum, order) => sum + order.totalAmount, 0),
    deliveryFee: null,
  };
}

export async function createOrderCheckout(
  buyerId: string,
  input: CreateOrderInput,
): Promise<OrderCheckoutResponse> {
  const { firestore } = getFirebaseAdmin();
  const checkoutRef = checkoutsCollection().doc(checkoutDocId(buyerId, input.checkoutId));
  const cartRef = cartDoc(buyerId);

  const existing = await checkoutRef.get();
  if (existing.exists) return checkoutResponseFrom(existing.data()!, buyerId);

  let placedOrders: Order[] = [];
  const checkout = await firestore.runTransaction(async (transaction) => {
    const checkoutSnapshot = await transaction.get(checkoutRef);
    if (checkoutSnapshot.exists) return checkoutResponseFrom(checkoutSnapshot.data()!, buyerId);

    const cartSnapshot = await transaction.get(cartRef);
    const cart = storedCartSchema.parse(cartSnapshot.data() ?? {});
    if (cart.items.length === 0) {
      throw new HttpError(400, 'CART_EMPTY', 'Add products to the cart before placing an order.');
    }

    const productIds = [...new Set(cart.items.map((item) => item.productId))];
    const products = new Map<string, ReturnType<typeof parseStoredProduct>>();
    for (const productId of productIds) {
      const snapshot = await transaction.get(productDoc(productId));
      if (!snapshot.exists) {
        throw new HttpError(409, 'PRODUCT_UNAVAILABLE', 'An item in your cart is no longer available.');
      }
      products.set(productId, parseStoredProduct(snapshot.data()));
    }

    const quantities = new Map<string, number>();
    for (const item of cart.items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }

    const validatedItems: Array<{ item: StoredCartItem; product: ReturnType<typeof parseStoredProduct> }> = [];
    for (const item of cart.items) {
      const product = products.get(item.productId)!;
      if (product.deleted || product.status !== 'active' || product.stock <= 0) {
        throw new HttpError(409, 'PRODUCT_UNAVAILABLE', 'An item in your cart is no longer available.');
      }
      if (product.sellerId !== item.sellerId) {
        throw new HttpError(409, 'PRODUCT_UNAVAILABLE', 'An item in your cart changed farmer.');
      }
      if (product.sellerId === buyerId) {
        throw new HttpError(400, 'OWN_PRODUCT', 'You cannot order your own product.');
      }
      if (item.quantity < product.minOrderQty) {
        throw new HttpError(400, 'MIN_ORDER_QTY', 'Quantity is below the minimum order.');
      }
      if ((quantities.get(product.id) ?? item.quantity) > product.stock) {
        throw new HttpError(409, 'INSUFFICIENT_STOCK', 'Requested quantity exceeds available stock.');
      }
      validatedItems.push({ item, product });
    }

    const sellerIds = [...new Set(validatedItems.map(({ item }) => item.sellerId))];
    const now = new Date().toISOString();
    const createdOrders: Order[] = [];
    const orderIds: string[] = [];
    let totalAmount = 0;

    for (const sellerId of sellerIds) {
      const sellerItems = validatedItems.filter(({ item }) => item.sellerId === sellerId);
      const items = sellerItems.map(({ item, product }) => ({
        productId: item.productId,
        sellerId,
        name: { bn: product.name.bn, en: product.name.en },
        quantity: item.quantity,
        unitPrice: product.price,
        unit: product.unit,
      }));
      const sellerTotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      totalAmount += sellerTotal;

      const orderId = orderDocId(buyerId, input.checkoutId, sellerId);
      const orderRef = ordersCollection().doc(orderId);
      const statusHistory = [
        createStatusEvent({
          from: null,
          to: 'pending',
          actorId: buyerId,
          actorRole: 'buyer',
          at: now,
          reason: 'Order created from cart',
          stockAdjusted: false,
        }),
      ];
      const order: Order = {
        id: orderId,
        buyerId,
        sellerIds: [sellerId],
        items,
        status: 'pending',
        totalAmount: sellerTotal,
        deliveryFee: null,
        deliveryAddress: input.deliveryAddress as DeliveryAddress,
        stockAdjusted: false,
        stockRestored: false,
        statusHistory,
        createdAt: now,
        updatedAt: now,
      };

      transaction.set(orderRef, order);
      transaction.set(orderRef.collection('statusHistory').doc(statusHistory[0].id), statusHistory[0]);
      createdOrders.push(order);
      orderIds.push(orderId);
    }

    transaction.set(checkoutRef, {
      id: checkoutRef.id,
      buyerId,
      checkoutId: input.checkoutId,
      orderIds,
      sellerIds,
      totalAmount,
      deliveryFee: null,
      deliveryAddress: input.deliveryAddress,
      createdAt: now,
      updatedAt: now,
    });
    transaction.delete(cartRef);
    placedOrders = createdOrders;

    return {
      checkoutId: input.checkoutId,
      orders: createdOrders,
      orderIds,
      farmerCount: sellerIds.length,
      itemCount: validatedItems.length,
      totalAmount,
      deliveryFee: null,
    };
  });

  for (const order of placedOrders) {
    await safeNotifyOrder(order, 'pending', 'buyer');
  }
  return checkout;
}

export async function acceptFarmerOrder(sellerId: string, orderId: string): Promise<Order> {
  const { firestore } = getFirebaseAdmin();
  const orderRef = ordersCollection().doc(orderId);
  const now = FieldValue.serverTimestamp();
  const at = new Date().toISOString();

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const order = serializeOrder(snapshot.data());
    assertFarmerOwnsOrder(order, sellerId);
    assertAllowedOrderTransition('farmer', order.status, 'accepted');

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

    const event = createStatusEvent({
      from: order.status,
      to: 'accepted',
      actorId: sellerId,
      actorRole: 'farmer',
      at,
      reason: 'Farmer accepted the order',
      stockAdjusted: true,
    });
    transaction.update(orderRef, {
      status: 'accepted' satisfies OrderStatus,
      acceptedBy: sellerId,
      acceptedAt: now,
      stockAdjusted: true,
      stockRestored: false,
      statusHistory: [...order.statusHistory, event],
      updatedAt: now,
    });
    transaction.set(orderRef.collection('statusHistory').doc(event.id), event);
  });

  const accepted = (await getOrder(orderId))!;
  await safeNotifyOrder(accepted, 'accepted', 'farmer');
  return accepted;
}

export async function rejectFarmerOrder(
  sellerId: string,
  orderId: string,
  reason: string,
): Promise<Order> {
  const { firestore } = getFirebaseAdmin();
  const orderRef = ordersCollection().doc(orderId);
  const now = FieldValue.serverTimestamp();
  const at = new Date().toISOString();

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const order = serializeOrder(snapshot.data());
    assertFarmerOwnsOrder(order, sellerId);
    assertAllowedOrderTransition('farmer', order.status, 'rejected');

    const event = createStatusEvent({
      from: order.status,
      to: 'rejected',
      actorId: sellerId,
      actorRole: 'farmer',
      at,
      reason,
      stockAdjusted: false,
    });
    transaction.update(orderRef, {
      status: 'rejected' satisfies OrderStatus,
      rejectionReason: reason,
      rejectedBy: sellerId,
      rejectedAt: now,
      statusHistory: [...order.statusHistory, event],
      updatedAt: now,
    });
    transaction.set(orderRef.collection('statusHistory').doc(event.id), event);
  });

  const rejected = (await getOrder(orderId))!;
  await safeNotifyOrder(rejected, 'rejected', 'farmer');
  return rejected;
}

export async function cancelOrder(
  actorId: string,
  role: 'buyer' | 'admin',
  orderId: string,
  reason?: string,
): Promise<Order> {
  assertApiMutableOrderStatus('cancelled');
  const { firestore } = getFirebaseAdmin();
  const orderRef = ordersCollection().doc(orderId);
  const now = FieldValue.serverTimestamp();
  const at = new Date().toISOString();

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    const order = serializeOrder(snapshot.data());
    if (role === 'buyer') assertBuyerOwnsOrder(order, actorId);
    assertAllowedOrderTransition(role, order.status, 'cancelled');

    const shouldRestore =
      order.status === 'accepted' && order.stockRestored !== true && order.stockAdjusted !== false;
    const quantities = new Map<string, { sellerId: string; quantity: number }>();
    if (shouldRestore) {
      for (const item of order.items) {
        const current = quantities.get(item.productId);
        quantities.set(item.productId, {
          sellerId: item.sellerId,
          quantity: (current?.quantity ?? 0) + item.quantity,
        });
      }
    }

    const productSnapshots = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (const [productId, entry] of quantities) {
      const productSnapshot = await transaction.get(firestore.collection('products').doc(productId));
      if (!productSnapshot.exists || productSnapshot.get('sellerId') !== entry.sellerId) {
        throw new HttpError(409, 'PRODUCT_UNAVAILABLE', 'Stock cannot be restored for this order.');
      }
      productSnapshots.set(productId, productSnapshot);
    }

    for (const [productId, entry] of quantities) {
      const productSnapshot = productSnapshots.get(productId)!;
      const previousQuantity = Number(productSnapshot.get('stock'));
      if (!Number.isFinite(previousQuantity) || previousQuantity < 0) {
        throw new HttpError(409, 'INVALID_STOCK', 'Product stock is invalid.');
      }
      const newQuantity = previousQuantity + entry.quantity;
      const previousStatus = productSnapshot.get('status');
      const productRef = firestore.collection('products').doc(productId);
      transaction.update(productRef, {
        stock: newQuantity,
        status: previousStatus === 'out_of_stock' ? 'active' : previousStatus,
        updatedAt: now,
      });

      const historyRef = productRef.collection('stockHistory').doc();
      transaction.set(historyRef, {
        id: historyRef.id,
        productId,
        sellerId: entry.sellerId,
        actorId,
        previousQuantity,
        newQuantity,
        reason: `Order ${orderId} cancelled`,
        createdAt: now,
        updatedAt: now,
      });
    }

    const event = createStatusEvent({
      from: order.status,
      to: 'cancelled',
      actorId,
      actorRole: role,
      at,
      reason,
      stockAdjusted: shouldRestore,
    });
    transaction.update(orderRef, {
      status: 'cancelled' satisfies OrderStatus,
      cancelledBy: actorId,
      cancelledAt: now,
      ...(reason ? { cancellationReason: reason } : {}),
      stockAdjusted: order.stockAdjusted ?? false,
      stockRestored: shouldRestore ? true : (order.stockRestored ?? false),
      statusHistory: [...order.statusHistory, event],
      updatedAt: now,
    });
    transaction.set(orderRef.collection('statusHistory').doc(event.id), event);
  });

  const cancelled = (await getOrder(orderId))!;
  await safeNotifyOrder(cancelled, 'cancelled', role);
  return cancelled;
}
