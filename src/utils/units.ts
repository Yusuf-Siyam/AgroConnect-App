import { MAUND_TO_KG } from '@/features/farmer/types';
import type { ProductUnit } from '@/features/farmer/types';
import type { Locale } from '@/types/locale';

const gramsPerUnit: Record<ProductUnit, number> = {
  gram: 1,
  kg: 1_000,
  mon: MAUND_TO_KG * 1_000,
  ton: 1_000_000,
};

/** Shared conversion helper; the maund constant stays product-owner pending. */
export function toKilograms(quantity: number, unit: ProductUnit): number {
  return (quantity * gramsPerUnit[unit]) / 1_000;
}

export function unitConversionLabel(locale: Locale): string {
  return locale === 'bn' ? '১ মণ = ৪০ কেজি' : `1 mon = ${MAUND_TO_KG} kg`;
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    maximumFractionDigits: 2,
  }).format(value);
}
