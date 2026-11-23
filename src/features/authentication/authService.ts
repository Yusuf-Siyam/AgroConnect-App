import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { env } from '@/config/env';
import { getFirebase } from '@/services/firebase';
import type { RegisterValues } from './schemas';

export { toAuthErrorCode, type AuthErrorCode } from './authErrors';

function assertConfigured(): void {
  if (!env.isFirebaseConfigured) {
    throw Object.assign(new Error('Firebase is not configured'), { code: 'auth/config-missing' });
  }
}

export async function signIn(email: string, password: string): Promise<User> {
  assertConfigured();
  const { auth } = getFirebase();
  if (__DEV__) console.info('[auth] signIn:start', { email: email.trim() });
  try {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    if (__DEV__) console.info('[auth] signIn:firebase-success', { uid: credential.user.uid });
    return credential.user;
  } catch (error) {
    if (__DEV__) console.warn('[auth] signIn:firebase-error', { code: (error as { code?: string })?.code });
    throw error;
  }
}

export async function register(values: RegisterValues): Promise<User> {
  assertConfigured();
  const { auth, firestore } = getFirebase();
  const phoneNumber = values.phoneNumber?.trim();

  if (__DEV__) console.info('[auth] register:start', { email: values.email.trim(), role: values.role });
  let credential;
  try {
    credential = await createUserWithEmailAndPassword(auth, values.email.trim(), values.password);
    if (__DEV__) console.info('[auth] register:firebase-success', { uid: credential.user.uid });
  } catch (error) {
    if (__DEV__) console.warn('[auth] register:firebase-error', { code: (error as { code?: string })?.code });
    throw error;
  }

  await updateProfile(credential.user, { displayName: values.fullName.trim() });

  try {
    await setDoc(
      doc(firestore, 'users', credential.user.uid),
      {
        uid: credential.user.uid,
        email: credential.user.email,
        displayName: values.fullName.trim(),
        ...(phoneNumber ? { phoneNumber } : {}),
        role: values.role,
        isVerified: false,
        preferredLanguage: 'bn',
        ...(values.role === 'transporter'
          ? {
              vehicle: {
                type: values.vehicleType!.trim(),
                registrationNumber: values.registrationNumber!.trim(),
              },
            }
          : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    if (__DEV__) console.info('[auth] register:profile-created', { uid: credential.user.uid });
  } catch (error) {
    if (__DEV__)
      console.warn('[auth] register:profile-create-error', {
        uid: credential.user.uid,
        code: (error as { code?: string })?.code,
      });
    throw error;
  }

  return credential.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  assertConfigured();
  const { auth } = getFirebase();
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutUser(): Promise<void> {
  if (!env.isFirebaseConfigured) return;
  const { auth } = getFirebase();
  await signOut(auth);
}
