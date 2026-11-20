import { z } from 'zod';

export const transporterProfileFormSchema = z.object({
  name: z.string().trim().min(2, 'transporter.validation.nameMin'),
  phone: z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'transporter.validation.phoneInvalid'),
  district: z.string().trim().min(2, 'transporter.validation.districtRequired'),
  vehicleType: z.string().trim().min(2, 'transporter.validation.vehicleTypeRequired'),
  plateNumber: z.string().trim().min(2, 'transporter.validation.plateRequired'),
  capacityKg: z
    .string()
    .trim()
    .refine((value) => Number(value) > 0, 'transporter.validation.capacityPositive'),
});

export type TransporterProfileFormValues = z.infer<typeof transporterProfileFormSchema>;

export function toTransporterProfilePayload(values: TransporterProfileFormValues) {
  return {
    name: values.name.trim(),
    phone: values.phone.trim(),
    district: values.district.trim(),
    vehicleType: values.vehicleType.trim(),
    plateNumber: values.plateNumber.trim(),
    capacityKg: Number(values.capacityKg),
  };
}

export function toTransporterProfileFormValues(profile: {
  name: string;
  phone: string;
  district: string;
  vehicleType: string;
  plateNumber: string;
  capacityKg: number;
}): TransporterProfileFormValues {
  return {
    name: profile.name,
    phone: profile.phone,
    district: profile.district,
    vehicleType: profile.vehicleType,
    plateNumber: profile.plateNumber,
    capacityKg: String(profile.capacityKg),
  };
}

export const deliveryCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'transporter.validation.codeInvalid'),
});

export type DeliveryCodeFormValues = z.infer<typeof deliveryCodeSchema>;
