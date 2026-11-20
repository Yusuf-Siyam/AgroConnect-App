import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    phoneNumber: z.string().trim().regex(/^\+?[0-9]{7,15}$/).optional(),
    district: z.string().trim().min(2).max(80).optional(),
    preferredLanguage: z.enum(['bn', 'en']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export function validationMessage(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}
