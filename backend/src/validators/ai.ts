import { z } from 'zod';

export const aiLanguageSchema = z.enum(['bn', 'en']);

export const chatSchema = z
  .object({
    message: z.string().trim().min(1).max(2_000),
    language: aiLanguageSchema.optional(),
    conversationId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const paginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const conversationIdParamSchema = z
  .object({ conversationId: z.string().trim().min(1).max(128) })
  .strict();

const cloudinaryImageSchema = z
  .object({
    provider: z.literal('cloudinary'),
    publicId: z.string().trim().min(1).max(300),
    resourceType: z.literal('image'),
    deliveryType: z.literal('authenticated'),
    version: z.number().int().positive().optional(),
    format: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

// A 5 MB image needs at most ceil(5 MiB / 3) * 4 base64 characters.
const MAX_INLINE_BASE64_CHARS = 6_991_064;

export const inlineImageSchema = z
  .object({
    provider: z.literal('inline'),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    data: z
      .string()
      .min(1)
      .max(MAX_INLINE_BASE64_CHARS)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'image data must be unpadded-prefix base64'),
  })
  .strict();

export const diagnoseImageSchema = z.union([inlineImageSchema, cloudinaryImageSchema]);

export const diagnoseSchema = z
  .object({
    image: diagnoseImageSchema,
    cropName: z.string().trim().min(1).max(100).optional(),
    language: aiLanguageSchema.optional(),
  })
  .strict();

export const diagnosisIdParamSchema = z
  .object({ diagnosisId: z.string().trim().min(1).max(128) })
  .strict();

export type ChatInput = z.infer<typeof chatSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type DiagnoseInput = z.infer<typeof diagnoseSchema>;
