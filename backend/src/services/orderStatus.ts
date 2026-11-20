import { HttpError } from '../middleware/error';
import type { Role } from '../types/auth';

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
