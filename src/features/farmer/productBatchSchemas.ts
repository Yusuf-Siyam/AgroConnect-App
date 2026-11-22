import { z } from 'zod';

import { PRODUCT_UNITS } from './types';
import { PRODUCT_BATCH_STATUSES, type ProductBatch } from './productBatchTypes';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export const productBatchFormSchema = z
  .object({
    productId: z.string().trim().min(1, 'validation.required'),
    harvestRecordId: z.string().trim(),
    quantity: z.string().trim().refine((value) => Number(value) > 0, 'validation.quantityPositive'),
    unit: z.enum(PRODUCT_UNITS, { error: 'validation.required' }),
    producedAt: z.string().trim(),
    expiresAt: z.string().trim(),
    status: z.enum(PRODUCT_BATCH_STATUSES, { error: 'validation.required' }),
  })
  .superRefine((values, context) => {
    if (!isCalendarDate(values.producedAt)) {
      context.addIssue({ code: 'custom', path: ['producedAt'], message: 'validation.dateInvalid' });
    }
    if (values.expiresAt) {
      if (!isCalendarDate(values.expiresAt)) {
        context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'validation.dateInvalid' });
      } else if (isCalendarDate(values.producedAt) && values.expiresAt < values.producedAt) {
        context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'validation.batchExpiryOrder' });
      }
    }
  });

export type ProductBatchFormValues = z.infer<typeof productBatchFormSchema>;

export type ProductBatchPayload = {
  productId: string;
  harvestRecordId?: string;
  quantity: number;
  unit: (typeof PRODUCT_UNITS)[number];
  producedAt: string;
  expiresAt?: string;
  status: (typeof PRODUCT_BATCH_STATUSES)[number];
};

export const emptyProductBatchForm: ProductBatchFormValues = {
  productId: '',
  harvestRecordId: '',
  quantity: '1',
  unit: 'kg',
  producedAt: '',
  expiresAt: '',
  status: 'active',
};

export function toProductBatchPayload(values: ProductBatchFormValues): ProductBatchPayload {
  return {
    productId: values.productId.trim(),
    ...(values.harvestRecordId ? { harvestRecordId: values.harvestRecordId.trim() } : {}),
    quantity: Number(values.quantity),
    unit: values.unit,
    producedAt: values.producedAt.trim(),
    ...(values.expiresAt ? { expiresAt: values.expiresAt.trim() } : {}),
    status: values.status,
  };
}

export function toProductBatchFormValues(batch: ProductBatch): ProductBatchFormValues {
  return {
    productId: batch.productId,
    harvestRecordId: batch.harvestRecordId ?? '',
    quantity: String(batch.quantity),
    unit: batch.unit,
    producedAt: batch.producedAt,
    expiresAt: batch.expiresAt ?? '',
    status: batch.status,
  };
}
