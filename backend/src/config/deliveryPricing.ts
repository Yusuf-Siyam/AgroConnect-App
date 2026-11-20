/**
 * PLACEHOLDER delivery pricing. The product owner must confirm every value.
 * Phase 07B must call calculateDeliveryFee() before payment so the buyer sees
 * the complete amount, then snapshot that fee on the order.
 */

export type DeliveryPricingConfig = {
  baseFeeBdt: number;
  perKmBdt: number;
  perKgBdt: number;
  commissionRate: number;
  ownerMustConfirm: true;
};

function envNumber(name: string, fallback: number, min: number, max?: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || (max !== undefined && value > max)) {
    return fallback;
  }
  return value;
}

export const DELIVERY_PRICING: DeliveryPricingConfig = {
  baseFeeBdt: envNumber('DELIVERY_BASE_FEE_BDT', 40, 0),
  perKmBdt: envNumber('DELIVERY_PER_KM_BDT', 10, 0),
  perKgBdt: envNumber('DELIVERY_PER_KG_BDT', 2, 0),
  commissionRate: envNumber('DELIVERY_COMMISSION_RATE', 0.1, 0, 1),
  ownerMustConfirm: true,
};

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateDeliveryFee(distanceKm: number, weightKg: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new RangeError('distanceKm must be a finite non-negative number');
  }
  if (!Number.isFinite(weightKg) || weightKg < 0) {
    throw new RangeError('weightKg must be a finite non-negative number');
  }
  return roundMoney(
    DELIVERY_PRICING.baseFeeBdt +
      DELIVERY_PRICING.perKmBdt * distanceKm +
      DELIVERY_PRICING.perKgBdt * weightKg,
  );
}

export function calculateCommission(deliveryFee: number): number {
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
    throw new RangeError('deliveryFee must be a finite non-negative number');
  }
  return roundMoney(deliveryFee * DELIVERY_PRICING.commissionRate);
}

export function calculateDeliveryBreakdown(
  distanceKm: number,
  weightKg: number,
): { deliveryFee: number; commission: number; netAmount: number } {
  const deliveryFee = calculateDeliveryFee(distanceKm, weightKg);
  const commission = calculateCommission(deliveryFee);
  return { deliveryFee, commission, netAmount: roundMoney(deliveryFee - commission) };
}
