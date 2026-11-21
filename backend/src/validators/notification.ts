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
