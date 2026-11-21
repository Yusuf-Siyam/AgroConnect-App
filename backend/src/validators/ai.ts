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

export type ChatInput = z.infer<typeof chatSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
