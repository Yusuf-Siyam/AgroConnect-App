import { createHash, randomUUID } from 'node:crypto';

import { FieldValue } from 'firebase-admin/firestore';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import { createFcmPushProvider } from '../providers/push';
import type {
  NotificationDelivery,
  NotificationParams,
  NotificationPlatform,
  NotificationTarget,
  NotificationType,
  PushProvider,
} from '../types/notification';

import { renderNotification } from './notificationTemplates';

let activeProvider: PushProvider | undefined;

/** Inject a provider from tests; production uses Firebase Cloud Messaging. */
export function setPushProvider(provider: PushProvider): void {
  activeProvider = provider;
}

function pushProvider(): PushProvider {
  activeProvider ??= createFcmPushProvider();
  return activeProvider;
}

/** Device documents are keyed by a hash so a raw FCM/APNs token is never an id. */
export function deviceTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: NotificationPlatform,
): Promise<void> {
  const { firestore } = getFirebaseAdmin();
  const timestamp = FieldValue.serverTimestamp();
  await firestore
    .collection('users')
    .doc(userId)
    .collection('devices')
    .doc(deviceTokenHash(token))
    .set(
      {
        token,
        userId,
        platform,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      { merge: true },
    );
}

export async function removeDeviceToken(userId: string, token: string): Promise<void> {
  const { firestore } = getFirebaseAdmin();
  await firestore
    .collection('users')
    .doc(userId)
    .collection('devices')
    .doc(deviceTokenHash(token))
    .delete();
}

async function getDeviceTokens(userId: string): Promise<string[]> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await firestore.collection('users').doc(userId).collection('devices').get();
  return snapshot.docs
    .map((entry) => entry.data()?.token)
    .filter((token): token is string => typeof token === 'string' && token.length > 0);
}

async function resolveLocale(userId: string): Promise<'bn' | 'en'> {
  try {
    const { firestore } = getFirebaseAdmin();
    const snapshot = await firestore.collection('users').doc(userId).get();
    return snapshot.data()?.preferredLanguage === 'en' ? 'en' : 'bn';
  } catch {
    return 'bn';
  }
}

/**
 * Central notify hook for Phase 10 chat/support events. Future Phase 07B
 * payment, group-buying and price-alert events should call this same function
 * with a new registered type; those types are deliberately not added now.
 *
 * The in-app notification is written first through the Admin SDK. Push is best
 * effort: any failure is logged and swallowed so it never breaks the chat or
 * message action that triggered it. Message content is never persisted here.
 */
export async function notifyUser(
  userId: string,
  type: NotificationType,
  params: NotificationParams,
  target: NotificationTarget,
): Promise<NotificationDelivery> {
  const notificationId = randomUUID();
  let inAppCreated = false;

  try {
    const { firestore } = getFirebaseAdmin();
    await firestore.collection('notifications').doc(notificationId).set({
      id: notificationId,
      userId,
      type,
      params,
      target,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    inAppCreated = true;
  } catch (error) {
    console.error('[notifyUser] in-app notification write failed (non-fatal)', error);
  }

  let pushDelivered = false;
  try {
    const tokens = await getDeviceTokens(userId);
    if (tokens.length > 0) {
      const locale = await resolveLocale(userId);
      const text = renderNotification(locale, type, params);
      await pushProvider().send(userId, tokens, {
        title: text.title,
        body: text.body,
        data: {
          notificationId,
          chatId: target.chatId,
          url: target.url,
        },
      });
      pushDelivered = true;
    }
  } catch (error) {
    console.error('[notifyUser] best-effort push failed (non-fatal)', error);
  }

  return { inAppCreated, pushDelivered };
}

/** Mark-read is a write, so mobile performs it through the backend, not Firestore. */
export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  const { firestore } = getFirebaseAdmin();
  const ref = firestore.collection('notifications').doc(notificationId);
  const snapshot = await ref.get();
  const data = snapshot.exists ? snapshot.data() ?? {} : undefined;
  if (!data || data.userId !== userId) {
    throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
  }
  await ref.update({
    readAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
