import { FieldValue } from 'firebase-admin/firestore';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import type {
  TransporterProfile,
  VerificationStatus,
} from '../types/delivery';
import type {
  CreateTransporterProfileInput,
  UpdateTransporterProfileInput,
} from '../validators/delivery';

function transporterDoc(transporterId: string) {
  const { firestore } = getFirebaseAdmin();
  return firestore.collection('transporters').doc(transporterId);
}

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  throw new Error('Transporter timestamp is missing or invalid');
}

function serializeProfile(data: FirebaseFirestore.DocumentData): TransporterProfile {
  return {
    transporterId: String(data.transporterId),
    name: String(data.name),
    phone: String(data.phone),
    district: String(data.district),
    vehicleType: String(data.vehicleType),
    plateNumber: String(data.plateNumber),
    capacityKg: Number(data.capacityKg),
    verificationStatus: data.verificationStatus as VerificationStatus,
    isVerified: data.isVerified === true,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

export async function getTransporterProfile(
  transporterId: string,
): Promise<TransporterProfile | null> {
  const snapshot = await transporterDoc(transporterId).get();
  return snapshot.exists ? serializeProfile(snapshot.data()!) : null;
}

export async function createTransporterProfile(
  transporterId: string,
  input: CreateTransporterProfileInput,
): Promise<TransporterProfile> {
  const ref = transporterDoc(transporterId);
  const snapshot = await ref.get();
  if (snapshot.exists) {
    throw new HttpError(409, 'PROFILE_EXISTS', 'A transporter profile already exists.');
  }

  const now = FieldValue.serverTimestamp();
  await ref.set({
    transporterId,
    ...input,
    verificationStatus: 'pending' satisfies VerificationStatus,
    isVerified: false,
    createdAt: now,
    updatedAt: now,
  });
  return (await getTransporterProfile(transporterId))!;
}

export async function updateTransporterProfile(
  transporterId: string,
  input: UpdateTransporterProfileInput,
): Promise<TransporterProfile> {
  const ref = transporterDoc(transporterId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Transporter profile not found.');
  }
  await ref.update({ ...input, updatedAt: FieldValue.serverTimestamp() });
  return (await getTransporterProfile(transporterId))!;
}

export async function requireVerifiedTransporter(
  transporterId: string,
): Promise<TransporterProfile> {
  const profile = await getTransporterProfile(transporterId);
  if (!profile || profile.verificationStatus !== 'verified' || !profile.isVerified) {
    throw new HttpError(
      403,
      'TRANSPORTER_NOT_VERIFIED',
      'Only verified transporters can accept delivery jobs.',
    );
  }
  return profile;
}

/** Backend/admin-only verification used by trusted scripts and tests. */
export async function setTransporterVerification(
  transporterId: string,
  status: VerificationStatus,
): Promise<TransporterProfile> {
  const ref = transporterDoc(transporterId);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new HttpError(404, 'PROFILE_NOT_FOUND', 'Transporter profile not found.');
  }
  await ref.update({
    verificationStatus: status,
    isVerified: status === 'verified',
    updatedAt: FieldValue.serverTimestamp(),
  });
  return (await getTransporterProfile(transporterId))!;
}
