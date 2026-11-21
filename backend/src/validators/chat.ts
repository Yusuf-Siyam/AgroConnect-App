import { z } from 'zod';

export const chatTypeSchema = z.enum(['buyer_farmer', 'buyer_transporter', 'support']);

export const createConversationSchema = z
  .object({
    type: chatTypeSchema,
    farmerId: z.string().trim().min(1).max(128).optional(),
    buyerId: z.string().trim().min(1).max(128).optional(),
    orderId: z.string().trim().min(1).max(128).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === 'buyer_farmer' && !value.farmerId && !value.buyerId) {
      context.addIssue({
        code: 'custom',
        message: 'farmerId or buyerId is required for a buyer-farmer conversation',
      });
    }
    if (value.type === 'buyer_transporter' && !value.orderId) {
      context.addIssue({ code: 'custom', message: 'orderId is required for a buyer-transporter conversation' });
    }
    if (value.type === 'support' && (value.farmerId || value.buyerId || value.orderId)) {
      context.addIssue({ code: 'custom', message: 'Support conversations do not accept party ids' });
    }
  });

export const messageSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    clientMessageId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const chatIdParamSchema = z
  .object({ chatId: z.string().trim().min(1).max(180) })
  .strict();

export const chatPaginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const messagePaginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().trim().min(1).max(180).optional(),
  })
  .strict();

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type ChatPaginationInput = z.infer<typeof chatPaginationSchema>;
export type MessagePaginationInput = z.infer<typeof messagePaginationSchema>;
