import { z } from 'zod';

const productIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Invalid product id');

export const signUploadSchema = z.discriminatedUnion('purpose', [
  z
    .object({
      purpose: z.literal('product'),
      productId: productIdSchema,
    })
    .strict(),
  z
    .object({
      purpose: z.literal('diagnosis'),
    })
    .strict(),
]);

export type SignUploadInput = z.infer<typeof signUploadSchema>;
