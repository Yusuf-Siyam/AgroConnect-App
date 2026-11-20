import type { ProductUnit } from '../types/product';

/** Bangladesh maund conversion. Flagged in README for product-owner confirmation. */
export const MAUND_TO_KG = 40;

const gramsPerUnit: Record<ProductUnit, number> = {
  gram: 1,
  kg: 1_000,
  mon: MAUND_TO_KG * 1_000,
  ton: 1_000_000,
};

export function toKilograms(quantity: number, unit: ProductUnit): number {
  return (quantity * gramsPerUnit[unit]) / 1_000;
}
