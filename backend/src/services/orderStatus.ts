import { HttpError } from '../middleware/error';
import type { Role } from '../types/auth';
import type { NotificationTarget, NotificationType } from '../types/notification';

import { notifyUser } from './notifications';

/**
 * Canonical order statuses and transitions introduced in Phase 07A.
 * Payment transitions remain deferred to Phase 07B. Transporter delivery
 * transitions are exposed only by the Phase 08 /api/delivery routes.
 */
export const ORDER_STATUSES = [
  'pending',
  'accepted',
  'paid',
  'shipment_accepted',
  'collected',
  'shipped',
  'delivered',
  'rejected',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderTransitionActor = Role | 'system';

export const PAID_OR_LATER_STATUSES: OrderStatus[] = [
  'paid',
  'shipment_accepted',
  'collected',
  'shipped',
  'delivered',
];

export const API_MUTABLE_ORDER_STATUSES = ['accepted', 'rejected', 'cancelled'] as const;

export const ORDER_STATUS_TRANSITIONS: Record<
  OrderTransitionActor,
  Partial<Record<OrderStatus, readonly OrderStatus[]>>
> = {
  farmer: { pending: ['accepted', 'rejected'] },
  buyer: { pending: ['cancelled'], accepted: ['cancelled'] },
  admin: {
    pending: ['cancelled'],
    accepted: ['cancelled'],
    paid: ['cancelled'],
    shipment_accepted: ['cancelled'],
    collected: ['cancelled'],
    shipped: ['cancelled'],
  },
  system: { accepted: ['paid'] },
  transporter: {
    paid: ['shipment_accepted'],
    shipment_accepted: ['collected'],
    collected: ['shipped'],
    shipped: ['delivered'],
  },
};

export function isAllowedOrderTransition(
  actor: OrderTransitionActor,
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return (ORDER_STATUS_TRANSITIONS[actor][from] ?? []).includes(to);
}

export function assertAllowedOrderTransition(
  actor: OrderTransitionActor,
  from: OrderStatus,
  to: OrderStatus,
): void {
  if (!isAllowedOrderTransition(actor, from, to)) {
    throw new HttpError(409, 'INVALID_ORDER_TRANSITION', 'Order status transition is not allowed.');
  }
}

export function assertApiMutableOrderStatus(status: OrderStatus): void {
  if (!API_MUTABLE_ORDER_STATUSES.includes(status as (typeof API_MUTABLE_ORDER_STATUSES)[number])) {
    throw new HttpError(403, 'FORBIDDEN', 'Payment and delivery statuses are backend-system only.');
  }
}

type NotifiableOrder = {
  id: string;
  buyerId: string;
  sellerIds?: string[];
  farmerId?: string;
};

type OrderRecipient = {
  userId: string;
  type: NotificationType;
  target: NotificationTarget;
};

function farmersOf(order: NotifiableOrder): string[] {
  const ids = order.sellerIds?.length
    ? order.sellerIds
    : order.farmerId
      ? [order.farmerId]
      : [];
  return [...new Set(ids.filter(Boolean))];
}

function recipient(
  userId: string,
  role: 'buyer' | 'farmer',
  type: NotificationType,
  orderId: string,
): OrderRecipient {
  return {
    userId,
    type,
    target: {
      orderId,
      url: role === 'buyer' ? `/buyer/orders/${orderId}` : `/farmer/orders/${orderId}`,
    },
  };
}

/**
 * Explicit extension point for deferred Phase 07B payment events. No payment,
 * group-buying or price-alert notification is registered or emitted here.
 */
export async function phase07BNotificationHook(
  order: NotifiableOrder,
  to: OrderStatus,
  actorRole: OrderTransitionActor,
): Promise<void> {
  void order;
  void to;
  void actorRole;
}

/** One shared mapping so every API/delivery transition uses the same recipients. */
export function orderNotificationRecipients(
  order: NotifiableOrder,
  to: OrderStatus,
  actorRole: OrderTransitionActor,
): OrderRecipient[] {
  const buyers = order.buyerId ? [recipient(order.buyerId, 'buyer', 'order_accepted', order.id)] : [];
  const farmers = farmersOf(order);

  switch (to) {
    case 'pending':
      return actorRole === 'buyer'
        ? farmers.map((id) => recipient(id, 'farmer', 'order_placed', order.id))
        : [];
    case 'accepted':
      return actorRole === 'farmer'
        ? buyers.map((entry) => ({ ...entry, type: 'order_accepted' as const }))
        : [];
    case 'rejected':
      return actorRole === 'farmer'
        ? buyers.map((entry) => ({ ...entry, type: 'order_rejected' as const }))
        : [];
    case 'cancelled': {
      const recipients =
        actorRole === 'admin'
          ? [...buyers, ...farmers.map((id) => recipient(id, 'farmer', 'order_cancelled', order.id))]
          : actorRole === 'buyer'
            ? farmers.map((id) => recipient(id, 'farmer', 'order_cancelled', order.id))
            : [];
      return recipients.map((entry) => ({ ...entry, type: 'order_cancelled' as const }));
    }
    case 'shipment_accepted':
      return actorRole === 'transporter'
        ? [
            ...buyers.map((entry) => ({ ...entry, type: 'job_accepted' as const })),
            ...farmers.map((id) => recipient(id, 'farmer', 'job_accepted', order.id)),
          ]
        : [];
    case 'collected':
      return actorRole === 'transporter'
        ? buyers.map((entry) => ({ ...entry, type: 'order_collected' as const }))
        : [];
    case 'shipped':
      return actorRole === 'transporter'
        ? buyers.map((entry) => ({ ...entry, type: 'order_shipped' as const }))
        : [];
    case 'delivered':
      return actorRole === 'transporter'
        ? [
            ...buyers.map((entry) => ({ ...entry, type: 'order_delivered' as const })),
            ...farmers.map((id) => recipient(id, 'farmer', 'order_delivered', order.id)),
          ]
        : [];
    case 'paid':
      return [];
    default:
      return [];
  }
}

/**
 * Call only after the main order/delivery transaction has committed. Each
 * notifyUser failure is swallowed so a notification outage never rolls back or
 * fails the action that caused it.
 */
export async function notifyOrderTransition(
  order: NotifiableOrder,
  to: OrderStatus,
  actorRole: OrderTransitionActor,
): Promise<void> {
  await phase07BNotificationHook(order, to, actorRole);
  for (const entry of orderNotificationRecipients(order, to, actorRole)) {
    try {
      await notifyUser(entry.userId, entry.type, { orderId: order.id }, entry.target);
    } catch (error) {
      console.error('[notifyOrderTransition] notification hook failed (non-fatal)', error);
    }
  }
}
