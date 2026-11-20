import { z } from 'zod';

const profileFields = {
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/),
  district: z.string().trim().min(2).max(100),
  vehicleType: z.string().trim().min(2).max(60),
  plateNumber: z.string().trim().min(2).max(40),
  capacityKg: z.number().finite().positive().max(100_000),
};

export const createTransporterProfileSchema = z.object(profileFields).strict();

export const updateTransporterProfileSchema = z
  .object({
    name: profileFields.name.optional(),
    phone: profileFields.phone.optional(),
    district: profileFields.district.optional(),
    vehicleType: profileFields.vehicleType.optional(),
    plateNumber: profileFields.plateNumber.optional(),
    capacityKg: profileFields.capacityKg.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const paginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const jobIdParamSchema = z.object({ jobId: z.string().min(1) }).strict();
export const orderIdParamSchema = z.object({ orderId: z.string().min(1) }).strict();

export const deliveryCodeSchema = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();

export const rejectJobSchema = z
  .object({ reason: z.string().trim().min(3).max(200).optional() })
  .strict();

export const locationSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();

export type CreateTransporterProfileInput = z.infer<typeof createTransporterProfileSchema>;
export type UpdateTransporterProfileInput = z.infer<typeof updateTransporterProfileSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type DeliveryCodeInput = z.infer<typeof deliveryCodeSchema>;
export type RejectJobInput = z.infer<typeof rejectJobSchema>;
export type LocationInput = z.infer<typeof locationSchema>;
