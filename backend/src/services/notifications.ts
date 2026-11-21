import { createHash, randomUUID } from 'node:crypto';

import { FieldValue, type DocumentData } from 'firebase-admin/firestore';

import { getFirebaseAdmin } from '../config/firebase';
import { HttpError } from '../middleware/error';
import { createFcmPushProvider } from '../providers/push';
import type {
  Notification,
  NotificationDelivery,
  NotificationList,
  NotificationParams,
  NotificationPlatform,
  NotificationTarget,
  NotificationType,
  NotificationUnreadCount,
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

function toIsoString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

function serializeNotification(id: string, data: DocumentData): Notification {
  const rawParams = (data.params ?? {}) as Record<string, unknown>;
  const rawTarget = (data.target ?? {}) as Record<string, unknown>;

  const params: NotificationParams =
    typeof rawParams.chatId === 'string' && typeof rawParams.senderName === 'string'
      ? { chatId: rawParams.chatId, senderName: rawParams.senderName }
      : { orderId: String(rawParams.orderId ?? '') };

  const url = String(rawTarget.url ?? '');
  const target: NotificationTarget =
    typeof rawTarget.chatId === 'string'
      ? { chatId: rawTarget.chatId, url }
      : { orderId: String(rawTarget.orderId ?? ''), url };

  return {
    id,
    userId: String(data.userId ?? ''),
    type: data.type as NotificationType,
    params,
    target,
    readAt: data.readAt ? toIsoString(data.readAt) : null,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function pushData(notificationId: string, target: NotificationTarget): Record<string, string> {
  const data: Record<string, string> = { notificationId, url: target.url };
  if ('chatId' in target) data.chatId = target.chatId;
  if ('orderId' in target) data.orderId = target.orderId;
  return data;
}

/**
 * Central notify hook for Phase 10 chat and order/delivery events. Future Phase
 * 07B events should call this with a newly registered type; no payment,
 * group-buying or price-alert notification is registered here.
 *
 * The in-app notification is written first through the Admin SDK. Push is best
 * effort: any failure is logged and swallowed so it never breaks the main
 * action. Chat text and delivery codes are never stored in the notification.
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
        data: pushData(notificationId, target),
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

export async function listNotifications(
  userId: string,
  query: { limit: number; offset: number; unread: boolean },
): Promise<NotificationList> {
  const { firestore } = getFirebaseAdmin();
  const base = firestore.collection('notifications').where('userId', '==', userId);
  const filtered = query.unread ? base.where('readAt', '==', null) : base;
  const [countSnapshot, pageSnapshot] = await Promise.all([
    filtered.get(),
    filtered
      .orderBy('createdAt', 'desc')
      .limit(query.limit)
      .offset(query.offset)
      .get(),
  ]);

  return {
    items: pageSnapshot.docs.map((document) => serializeNotification(document.id, document.data())),
    total: countSnapshot.size,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getUnreadNotificationCount(userId: string): Promise<NotificationUnreadCount> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await firestore
    .collection('notifications')
    .where('userId', '==', userId)
    .where('readAt', '==', null)
    .get();
  return { count: snapshot.size };
}

export async function markAllNotificationsRead(userId: string): Promise<{ updated: number }> {
  const { firestore } = getFirebaseAdmin();
  const snapshot = await firestore
    .collection('notifications')
    .where('userId', '==', userId)
    .where('readAt', '==', null)
    .get();

  const batchSize = 500;
  for (let index = 0; index < snapshot.docs.length; index += batchSize) {
    const batch = firestore.batch();
    for (const document of snapshot.docs.slice(index, index + batchSize)) {
      batch.update(document.ref, {
        readAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return { updated: snapshot.size };
}
