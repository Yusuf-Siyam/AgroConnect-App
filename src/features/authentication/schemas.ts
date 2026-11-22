import { z } from 'zod';

import { PUBLIC_REGISTER_ROLES } from '@/types/user';

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'required').email('invalidEmail'),
  password: z.string().min(1, 'required'),
});

/**
 * Form values allow an empty role so nothing is preselected. The resolver
 * rejects the empty value with `roleRequired`; `registerSchema` transforms the
 * validated form into the strict service input used by authService.
 */
export const registerFormSchema = z
  .object({
    fullName: z.string().trim().min(2, 'nameMin'),
    email: z.string().trim().min(1, 'required').email('invalidEmail'),
    phoneNumber: z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'phoneInvalid').optional().or(z.literal('')),
    password: z.string().min(8, 'passwordMin'),
    confirmPassword: z.string().min(1, 'required'),
    role: z.union([z.enum(PUBLIC_REGISTER_ROLES), z.literal('')]),
    vehicleType: z.string().trim().optional(),
    registrationNumber: z.string().trim().optional(),
  })
  .refine((value) => value.role !== '', {
    message: 'roleRequired',
    path: ['role'],
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'passwordsMatch',
    path: ['confirmPassword'],
  })
  .refine((value) => value.role !== 'transporter' || Boolean(value.vehicleType), {
    message: 'vehicleTypeRequired',
    path: ['vehicleType'],
  })
  .refine((value) => value.role !== 'transporter' || Boolean(value.registrationNumber), {
    message: 'registrationRequired',
    path: ['registrationNumber'],
  });

export const registerSchema = registerFormSchema.transform((value) => ({
  ...value,
  role: value.role as (typeof PUBLIC_REGISTER_ROLES)[number],
}));

export const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'required').email('invalidEmail'),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, 'nameMin'),
  phoneNumber: z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'phoneInvalid').optional().or(z.literal('')),
  district: z.string().trim().min(2, 'required').max(80, 'required').optional().or(z.literal('')),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.input<typeof registerSchema>;
export type RegisterValues = z.output<typeof registerSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ProfileValues = z.infer<typeof profileSchema>;
