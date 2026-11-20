import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateDeliveryBreakdown,
  calculateDeliveryFee,
  DELIVERY_PRICING,
  roundMoney,
} from './deliveryPricing';

test('delivery pricing placeholders are explicit and owner must confirm', () => {
  assert.equal(DELIVERY_PRICING.ownerMustConfirm, true);
  assert.equal(DELIVERY_PRICING.baseFeeBdt, 40);
  assert.equal(DELIVERY_PRICING.perKmBdt, 10);
  assert.equal(DELIVERY_PRICING.perKgBdt, 2);
  assert.equal(DELIVERY_PRICING.commissionRate, 0.1);
});

test('calculateDeliveryFee covers normal cases', () => {
  assert.equal(calculateDeliveryFee(10, 5), 150);
  assert.equal(calculateDeliveryFee(2.5, 12), 89);
});

test('calculateDeliveryFee covers zero distance and large weight', () => {
  assert.equal(calculateDeliveryFee(0, 0), 40);
  assert.equal(calculateDeliveryFee(0, 1000), 2040);
  assert.equal(calculateDeliveryFee(1000, 100_000), 210_040);
});

test('calculateDeliveryFee rounds money consistently', () => {
  assert.equal(calculateDeliveryFee(0.125, 0.125), 41.5);
  assert.equal(calculateDeliveryFee(0.005, 0), 40.05);
  assert.equal(roundMoney(1.005), 1.01);
});

test('calculateDeliveryFee rejects invalid inputs', () => {
  assert.throws(() => calculateDeliveryFee(-1, 1), RangeError);
  assert.throws(() => calculateDeliveryFee(1, -1), RangeError);
  assert.throws(() => calculateDeliveryFee(Number.NaN, 1), RangeError);
  assert.throws(() => calculateDeliveryFee(1, Number.POSITIVE_INFINITY), RangeError);
});

test('delivery breakdown computes commission and net once', () => {
  assert.deepEqual(calculateDeliveryBreakdown(10, 5), {
    deliveryFee: 150,
    commission: 15,
    netAmount: 135,
  });
});
