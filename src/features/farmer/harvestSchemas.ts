import { z } from 'zod';

import { PRODUCT_UNITS } from './types';
import {
  HARVEST_STATUSES,
  type HarvestRecord,
  type HarvestStatus,
  type HarvestStatusUpdate,
} from './harvestTypes';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): boolean {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function harvestFormDateProblem(values: {
  sowingDate: string;
  expectedHarvestDate: string;
  actualHarvestDate?: string;
  status?: HarvestStatus;
}): 'validation.dateInvalid' | 'validation.harvestDateOrder' | 'validation.harvestActualRequired' | 'validation.harvestActualOrder' | null {
  if (
    !isCalendarDate(values.sowingDate) ||
    !isCalendarDate(values.expectedHarvestDate) ||
    (values.actualHarvestDate && !isCalendarDate(values.actualHarvestDate))
  ) {
    return 'validation.dateInvalid';
  }
  if (values.sowingDate > values.expectedHarvestDate) return 'validation.harvestDateOrder';
  if (values.actualHarvestDate && values.actualHarvestDate < values.sowingDate) {
    return 'validation.harvestActualOrder';
  }
  if (values.status === 'harvested' && !values.actualHarvestDate) {
    return 'validation.harvestActualRequired';
  }
  return null;
}

export const harvestFormSchema = z
  .object({
    crop: z.string().trim().min(1, 'validation.required'),
    productId: z.string().trim(),
    plot: z.string().trim(),
    sowingDate: z.string().trim(),
    expectedHarvestDate: z.string().trim(),
    actualHarvestDate: z.string().trim(),
    expectedQuantity: z
      .string()
      .trim()
      .refine((value) => Number(value) > 0, 'validation.quantityPositive'),
    unit: z.enum(PRODUCT_UNITS, { error: 'validation.required' }),
    status: z.enum(HARVEST_STATUSES, { error: 'validation.required' }),
    notes: z.string().trim(),
  })
  .superRefine((values, context) => {
    const problem = harvestFormDateProblem({
      sowingDate: values.sowingDate,
      expectedHarvestDate: values.expectedHarvestDate,
      actualHarvestDate: values.actualHarvestDate || undefined,
      status: values.status,
    });
    if (problem) {
      const field =
        problem === 'validation.harvestActualRequired' || problem === 'validation.harvestActualOrder'
          ? 'actualHarvestDate'
          : problem === 'validation.harvestDateOrder'
            ? 'expectedHarvestDate'
            : 'sowingDate';
      context.addIssue({ code: 'custom', path: [field], message: problem });
    }
  });

export type HarvestFormValues = z.infer<typeof harvestFormSchema>;

export type HarvestPayload = {
  crop: string;
  productId?: string;
  plot?: string;
  sowingDate: string;
  expectedHarvestDate: string;
  actualHarvestDate?: string;
  expectedQuantity: number;
  unit: (typeof PRODUCT_UNITS)[number];
  status: HarvestStatus;
  notes?: string;
};

/** PATCH payload: status changes use the dedicated status endpoint. `null` clears an optional field. */
export type HarvestUpdatePayload = {
  crop: string;
  productId?: string | null;
  plot?: string | null;
  sowingDate: string;
  expectedHarvestDate: string;
  actualHarvestDate?: string | null;
  expectedQuantity: number;
  unit: (typeof PRODUCT_UNITS)[number];
  notes?: string | null;
};

export type HarvestEditPlan = {
  update: HarvestUpdatePayload;
  status?: HarvestStatusUpdate;
  statusFirst: boolean;
};

export const emptyHarvestForm: HarvestFormValues = {
  crop: '',
  productId: '',
  plot: '',
  sowingDate: '',
  expectedHarvestDate: '',
  actualHarvestDate: '',
  expectedQuantity: '1',
  unit: 'kg',
  status: 'planned',
  notes: '',
};

export function toHarvestPayload(values: HarvestFormValues): HarvestPayload {
  return {
    crop: values.crop.trim(),
    ...(values.productId ? { productId: values.productId.trim() } : {}),
    ...(values.plot ? { plot: values.plot.trim() } : {}),
    sowingDate: values.sowingDate.trim(),
    expectedHarvestDate: values.expectedHarvestDate.trim(),
    ...(values.actualHarvestDate ? { actualHarvestDate: values.actualHarvestDate.trim() } : {}),
    expectedQuantity: Number(values.expectedQuantity),
    unit: values.unit,
    status: values.status,
    ...(values.notes ? { notes: values.notes.trim() } : {}),
  };
}

export function toHarvestUpdatePayload(values: HarvestFormValues): HarvestUpdatePayload {
  return {
    crop: values.crop.trim(),
    productId: values.productId.trim() || null,
    plot: values.plot.trim() || null,
    sowingDate: values.sowingDate.trim(),
    expectedHarvestDate: values.expectedHarvestDate.trim(),
    actualHarvestDate: values.actualHarvestDate.trim() || null,
    expectedQuantity: Number(values.expectedQuantity),
    unit: values.unit,
    notes: values.notes.trim() || null,
  };
}

/** Keeps status transitions on the canonical status endpoint while allowing optional fields to be cleared. */
export function planHarvestEdit(
  record: HarvestRecord,
  values: HarvestFormValues,
): HarvestEditPlan {
  const statusChanged = values.status !== record.status;
  return {
    update: toHarvestUpdatePayload(values),
    status: statusChanged
      ? {
          status: values.status,
          ...(values.actualHarvestDate.trim()
            ? { actualHarvestDate: values.actualHarvestDate.trim() }
            : {}),
        }
      : undefined,
    statusFirst: statusChanged && record.status === 'harvested' && values.status !== 'harvested',
  };
}

export function toHarvestFormValues(record: HarvestRecord): HarvestFormValues {
  return {
    crop: record.crop,
    productId: record.productId ?? '',
    plot: record.plot ?? '',
    sowingDate: record.sowingDate,
    expectedHarvestDate: record.expectedHarvestDate,
    actualHarvestDate: record.actualHarvestDate ?? '',
    expectedQuantity: String(record.expectedQuantity),
    unit: record.unit,
    status: record.status,
    notes: record.notes ?? '',
  };
}

/** Groups a calendar list by YYYY-MM without depending on the device timezone. */
export function harvestMonthKey(date: string): string {
  return date.slice(0, 7);
}
