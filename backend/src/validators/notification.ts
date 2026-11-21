import { z } from 'zod';

export const deviceTokenSchema = z
  .object({
    token: z.string().trim().min(1).max(4096),
    platform: z.enum(['ios', 'android', 'web']),
  })
  .strict();

export const removeDeviceTokenSchema = z
  .object({
    token: z.string().trim().min(1).max(4096),
  })
  .strict();

export const notificationIdParamSchema = z
  .object({ notificationId: z.string().trim().min(1).max(180) })
  .strict();

export const notificationListSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    unread: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .strict();

export type NotificationListInput = z.infer<typeof notificationListSchema>;
