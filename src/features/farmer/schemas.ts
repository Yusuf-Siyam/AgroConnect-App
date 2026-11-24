import { z } from 'zod';

import { PRODUCT_STATUSES, PRODUCT_UNITS } from './types';

export const productFormSchema = z.object({
  nameBn: z.string().trim().min(2, 'validation.nameMin'),
  nameEn: z.string().trim().min(2, 'validation.nameMin'),
  category: z.string().trim().min(1, 'validation.required'),
  descriptionBn: z.string().trim().min(1, 'validation.required'),
  descriptionEn: z.string().trim().min(1, 'validation.required'),
  price: z.string().trim().refine((value) => Number(value) > 0, 'validation.pricePositive'),
  unit: z.enum(PRODUCT_UNITS, { error: 'validation.required' }),
  stock: z.string().trim().refine((value) => Number.isInteger(Number(value)) && Number(value) >= 0, 'validation.stockInvalid'),
  lowStockThreshold: z
    .string()
    .trim()
    .refine((value) => Number.isInteger(Number(value)) && Number(value) >= 0, 'validation.stockInvalid'),
  minOrderQty: z.string().trim().refine((value) => Number(value) > 0, 'validation.quantityPositive'),
  harvestDate: z
    .string()
    .trim()
    .min(1, 'validation.required')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.dateInvalid')
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), 'validation.dateInvalid'),
  district: z.string().trim().min(1, 'validation.required'),
  variety: z.string().trim().min(1, 'validation.required'),
  status: z.enum(PRODUCT_STATUSES, { error: 'validation.required' }),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export type ProductPayload = {
  id?: string;
  name: { bn: string; en: string };
  category: string;
  description: { bn: string; en: string };
  price: number;
  unit: (typeof PRODUCT_UNITS)[number];
  stock: number;
  lowStockThreshold: number;
  minOrderQty: number;
  harvestDate: string;
  harvestInfo: { district: string; variety: string };
  images: string[];
  status: (typeof PRODUCT_STATUSES)[number];
};

export function toProductPayload(values: ProductFormValues, images: string[], id?: string): ProductPayload {
  return {
    ...(id ? { id } : {}),
    name: { bn: values.nameBn.trim(), en: values.nameEn.trim() },
    category: values.category.trim(),
    description: { bn: values.descriptionBn.trim(), en: values.descriptionEn.trim() },
    price: Number(values.price),
    unit: values.unit,
    stock: Number(values.stock),
    lowStockThreshold: Number(values.lowStockThreshold),
    minOrderQty: Number(values.minOrderQty),
    harvestDate: values.harvestDate,
    harvestInfo: { district: values.district.trim(), variety: values.variety.trim() },
    images,
    status: values.status,
  };
}

export function toProductFormValues(product: {
  name: { bn: string; en: string };
  category: string;
  description: { bn: string; en: string };
  price: number;
  unit: (typeof PRODUCT_UNITS)[number];
  stock: number;
  lowStockThreshold: number;
  minOrderQty: number;
  harvestDate: string;
  harvestInfo: { district: string; variety: string };
  status: (typeof PRODUCT_STATUSES)[number];
}): ProductFormValues {
  return {
    nameBn: product.name.bn,
    nameEn: product.name.en,
    category: product.category,
    descriptionBn: product.description.bn,
    descriptionEn: product.description.en,
    price: String(product.price),
    unit: product.unit,
    stock: String(product.stock),
    lowStockThreshold: String(product.lowStockThreshold),
    minOrderQty: String(product.minOrderQty),
    harvestDate: product.harvestDate,
    district: product.harvestInfo.district,
    variety: product.harvestInfo.variety,
    status: product.status,
  };
}
