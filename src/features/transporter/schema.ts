import { z } from 'zod';

import { VERIFICATION_STATUSES, type BuyerDelivery, type DeliveryJob, type DeliveryJobList, type EarningsHistory, type EarningsRecord, type EarningsSummary, type TransporterProfile } from './types';

const coordinatesSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const locationSchema = coordinatesSchema.extend({ recordedAt: z.string() });

const transporterProfileSchema = z.object({
  transporterId: z.string(),
  name: z.string(),
  phone: z.string(),
  district: z.string(),
  vehicleType: z.string(),
  plateNumber: z.string(),
  capacityKg: z.number(),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  isVerified: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const deliveryJobSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  buyerId: z.string(),
  farmerId: z.string(),
  pickup: coordinatesSchema.extend({
    farmerId: z.string(),
    addressLine: z.string().optional(),
    district: z.string().optional(),
  }),
  dropoff: coordinatesSchema.extend({
    buyerId: z.string(),
    addressLine: z.string().optional(),
    district: z.string().optional(),
    phoneNumber: z.string().optional(),
  }),
  totalWeightKg: z.number(),
  distanceKm: z.number().nullable(),
  deliveryFee: z.number(),
  commission: z.number(),
  netAmount: z.number(),
  transporterId: z.string().nullable(),
  orderStatus: z.string(),
  location: locationSchema.optional(),
  rejectedBy: z.array(z.string()),
  deliveryCode: z.string().nullable(),
  codeAttempts: z.number(),
  codeLockedUntil: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const deliveryJobListSchema = z.object({
  items: z.array(deliveryJobSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

const buyerDeliverySchema = z.object({
  orderId: z.string(),
  orderStatus: z.string(),
  transporterId: z.string().nullable(),
  deliveryCode: z.string().nullable(),
  location: locationSchema.nullable(),
});

const earningsRecordSchema = z.object({
  id: z.string(),
  transporterId: z.string(),
  orderId: z.string(),
  jobId: z.string(),
  deliveryFee: z.number(),
  commission: z.number(),
  netAmount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const earningsSummarySchema = z.object({
  totalDeliveries: z.number(),
  totalDeliveryFee: z.number(),
  totalCommission: z.number(),
  totalNetAmount: z.number(),
});

const earningsHistorySchema = z.object({
  items: z.array(earningsRecordSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid API response: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
  }
  return result.data;
}

export const parseTransporterProfile = (data: unknown): TransporterProfile =>
  parseOrThrow(transporterProfileSchema, data);
export const parseDeliveryJob = (data: unknown): DeliveryJob => parseOrThrow(deliveryJobSchema, data);
export const parseDeliveryJobList = (data: unknown): DeliveryJobList =>
  parseOrThrow(deliveryJobListSchema, data);
export const parseBuyerDelivery = (data: unknown): BuyerDelivery => parseOrThrow(buyerDeliverySchema, data);
export const parseEarningsRecord = (data: unknown): EarningsRecord => parseOrThrow(earningsRecordSchema, data);
export const parseEarningsSummary = (data: unknown): EarningsSummary => parseOrThrow(earningsSummarySchema, data);
export const parseEarningsHistory = (data: unknown): EarningsHistory => parseOrThrow(earningsHistorySchema, data);
