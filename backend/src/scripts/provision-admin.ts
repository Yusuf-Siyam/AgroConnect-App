import { FieldValue } from 'firebase-admin/firestore';

import { getFirebaseAdmin } from '../config/firebase';

/**
 * One-time secure admin provisioning. Run with:
 *   npm run admin:provision -- <firebase-uid>
 *
 * The UID must belong to an already-registered Firebase Authentication user.
 * This script never accepts an email/password or creates a public admin route.
 */
async function main(): Promise<void> {
  const uid = process.argv[2]?.trim();

  if (!uid) {
    throw new Error('Usage: npm run admin:provision -- <firebase-uid>');
  }

  const { auth, firestore } = getFirebaseAdmin();
  const user = await auth.getUser(uid);

  await auth.setCustomUserClaims(uid, { admin: true, role: 'admin' });
  await firestore
    .collection('users')
    .doc(uid)
    .set(
      {
        uid,
        email: user.email ?? null,
        role: 'admin',
        isVerified: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  // Force a token refresh on the next sign-in so the new claim is present.
  await auth.revokeRefreshTokens(uid);

  console.log(`[agroconnect] admin claim granted to UID ${uid}`);
}

main().catch((error: unknown) => {
  console.error(`[agroconnect] admin provisioning failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
