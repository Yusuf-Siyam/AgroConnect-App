import { z } from 'zod';

import type { Role, UserProfile } from '@/types/user';

const roleSchema = z.enum(['farmer', 'buyer', 'transporter', 'admin'] as const);

const profileSchema = z.object({
  uid: z.string().min(1),
  email: z.string().nullable().default(null),
  displayName: z.string().default(''),
  phoneNumber: z.string().optional(),
  district: z.string().optional(),
  role: roleSchema,
  isVerified: z.boolean().default(false),
  preferredLanguage: z.enum(['bn', 'en']).optional(),
  vehicle: z
    .object({
      type: z.string(),
      registrationNumber: z.string(),
    })
    .optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export function parseRole(value: unknown): Role | undefined {
  const result = roleSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

type TimestampLike = { toDate?: () => Date };

function toIsoString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as TimestampLike;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  }
  return undefined;
}

export function parseUserProfile(data: unknown): UserProfile | null {
  if (!data || typeof data !== 'object') return null;

  const raw = data as Record<string, unknown>;
  const result = profileSchema.safeParse({
    ...raw,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  });

  return result.success ? result.data : null;
}
