import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getFirebaseAdmin } from '../config/firebase';
import { ROLES, type Role, type UserProfileResponse } from '../types/auth';

const roleSchema = z.enum(ROLES);

const userProfileSchema = z.object({
  uid: z.string().min(1),
  email: z.string().nullable().default(null),
  displayName: z.string().default(''),
  phoneNumber: z.string().optional(),
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

type StoredProfile = Omit<z.input<typeof userProfileSchema>, 'createdAt' | 'updatedAt'> & {
  createdAt?: string | { toDate(): Date } | FieldValue;
  updatedAt?: string | { toDate(): Date } | FieldValue;
};

export function parseRole(value: unknown): Role | undefined {
  const result = roleSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function toIsoString(value: StoredProfile['createdAt']): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const timestamp = value as { toDate?: () => Date };
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  }
  return undefined;
}

function serializeProfile(data: StoredProfile): UserProfileResponse {
  const parsed = userProfileSchema.parse({
    ...data,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  });

  return {
    uid: parsed.uid,
    email: parsed.email,
    displayName: parsed.displayName,
    phoneNumber: parsed.phoneNumber,
    role: parsed.role,
    isVerified: parsed.isVerified,
    preferredLanguage: parsed.preferredLanguage,
    vehicle: parsed.vehicle,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  };
}

/**
 * Reads the user's Firestore profile. If it does not exist yet, the server
 * creates it from trusted Firebase Auth data. The role comes only from a custom
 * claim or an explicitly trusted fallback, never from a request body.
 */
export async function getOrCreateProfile(
  uid: string,
  trustedRole?: Role,
): Promise<UserProfileResponse> {
  const { auth, firestore } = getFirebaseAdmin();
  const reference = firestore.collection('users').doc(uid);
  const snapshot = await reference.get();

  if (snapshot.exists) {
    return serializeProfile(snapshot.data() as StoredProfile);
  }

  const userRecord = await auth.getUser(uid);
  const role = trustedRole ?? 'farmer';
  const profile: StoredProfile = {
    uid,
    email: userRecord.email ?? null,
    displayName: userRecord.displayName ?? userRecord.email?.split('@')[0] ?? '',
    role,
    isVerified: role === 'admin',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await reference.set(profile, { merge: true });
  return serializeProfile(profile);
}

export type ProfilePatch = {
  displayName?: string;
  phoneNumber?: string;
  preferredLanguage?: 'bn' | 'en';
};

export async function updateUserProfile(uid: string, patch: ProfilePatch): Promise<UserProfileResponse> {
  const { firestore } = getFirebaseAdmin();
  const reference = firestore.collection('users').doc(uid);

  await reference.set(
    {
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return getOrCreateProfile(uid);
}
