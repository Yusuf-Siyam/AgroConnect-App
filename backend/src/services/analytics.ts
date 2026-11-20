import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { ORDER_STATUSES, type OrderStatus } from '../types/order';
import type { AnalyticsSummary, TopProduct } from '../types/analytics';

const storedPaymentSchema = z
  .object({
    orderId: z.string().min(1),
    sellerId: z.string().min(1),
    amount: z.number().finite().nonnegative(),
    status: z.string().trim().min(1),
  })
  .passthrough();

const PAID_PAYMENT_STATUSES = new Set(['completed', 'succeeded', 'paid', 'captured', 'success']);
const REVENUE_ORDER_STATUSES = new Set<OrderStatus>([
  'accepted',
  'paid',
  'shipment_accepted',
  'collected',
  'shipped',
  'delivered',
]);

const DAY_MS = 24 * 60 * 60 * 1000;

function emptyStatusCounts(): Record<OrderStatus, number> {
  return ORDER_STATUSES.reduce<Record<OrderStatus, number>>(
    (counts, status) => ({ ...counts, [status]: 0 }),
    {} as Record<OrderStatus, number>,
  );
}

function ordersCollection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('orders');
}

function paymentsCollection() {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('payments');
}

export async function getFarmerAnalytics(sellerId: string): Promise<AnalyticsSummary> {
  const orderSnapshot = await ordersCollection().where('sellerIds', 'array-contains', sellerId).get();
  const orders = orderSnapshot.docs
    .map((document) => document.data())
    .filter((data) => data?.createdAt)
    .map((data) => ({
      id: String(data.id),
      status: data.status as OrderStatus,
      createdAt: new Date(
        typeof data.createdAt === 'string'
          ? data.createdAt
          : (data.createdAt as { toDate(): Date }).toDate(),
      ),
      items: Array.isArray(data.items) ? data.items : [],
    }));
  const orderIds = new Set(orders.map((order) => order.id));

  const statusCounts = emptyStatusCounts();
  for (const order of orders) {
    if (order.status in statusCounts) statusCounts[order.status] += 1;
  }

  const paymentSnapshot = await paymentsCollection().where('sellerId', '==', sellerId).get();
  const paidAmountByOrder = new Map<string, number>();
  for (const document of paymentSnapshot.docs) {
    const payment = storedPaymentSchema.safeParse(document.data());
    if (!payment.success) continue;
    if (!orderIds.has(payment.data.orderId)) continue;
    if (!PAID_PAYMENT_STATUSES.has(payment.data.status.toLowerCase())) continue;
    paidAmountByOrder.set(
      payment.data.orderId,
      (paidAmountByOrder.get(payment.data.orderId) ?? 0) + payment.data.amount,
    );
  }

  const revenue = [...paidAmountByOrder.values()].reduce((total, amount) => total + amount, 0);
  const paidOrders = paidAmountByOrder.size;

  const topProductMap = new Map<string, TopProduct>();
  for (const order of orders) {
    if (!REVENUE_ORDER_STATUSES.has(order.status)) continue;
    for (const item of order.items) {
      if (item?.sellerId !== sellerId || !item.productId) continue;
      const productId = String(item.productId);
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) continue;

      const current = topProductMap.get(productId) ?? {
        productId,
        name: String(item.name?.en || item.name?.bn || productId),
        quantity: 0,
        revenue: 0,
      };
      current.quantity += quantity;
      current.revenue += quantity * unitPrice;
      topProductMap.set(productId, current);
    }
  }
  const topProducts = [...topProductMap.values()]
    .sort((left, right) => right.revenue - left.revenue)
    .slice(0, 5);

  const now = Date.now();
  const period = (days: number) => {
    const cutoff = now - days * DAY_MS;
    const periodOrders = orders.filter((order) => order.createdAt.getTime() >= cutoff);
    const periodRevenue = periodOrders.reduce(
      (total, order) => total + (paidAmountByOrder.get(order.id) ?? 0),
      0,
    );
    return { orders: periodOrders.length, revenue: periodRevenue };
  };

  return {
    statusCounts,
    revenue,
    paidOrders,
    topProducts,
    last7Days: period(7),
    last30Days: period(30),
    generatedAt: new Date(now).toISOString(),
  };
}
