import { z } from 'zod';

/** Checkout form only; order submission is intentionally Phase 07. */
export const checkoutSchema = z.object({
  addressLine: z.string().trim().min(10, 'addressMin'),
  district: z.string().trim().min(2, 'required'),
  phoneNumber: z.string().trim().regex(/^\+?[0-9]{7,15}$/, 'phoneInvalid'),
});

export type CheckoutValues = z.infer<typeof checkoutSchema>;
