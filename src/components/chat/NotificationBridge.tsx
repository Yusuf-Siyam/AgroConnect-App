import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { Platform } from 'react-native';
import { useEffect } from 'react';

import { markNotificationRead } from '@/features/chat/chatService';
import {
  notificationHref,
  notificationIdFromData,
  notificationUrlFromData,
  type PushData,
} from '@/features/chat/notificationRouting';
import { useDevicePushRegistration } from '@/features/chat/useDevicePush';
import { useAuth } from '@/providers/AuthProvider';
import { configureNotificationHandler } from '@/services/notifications';

// Must be installed before any notification is received.
configureNotificationHandler();

/** Connects native push tokens and role-aware notification taps to the app. */
export function NotificationBridge() {
  const { status, firebaseUser, profile } = useAuth();
  const router = useRouter();
  const role = profile?.role;
  const authenticated = status === 'authenticated';

  useDevicePushRegistration(authenticated ? (firebaseUser?.uid ?? null) : null, authenticated);

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

    const subscription = Notifications.addNotificationResponseReceivedListener(({ notification }) => {
      const data = notification.request.content.data as PushData;
      const href = role ? notificationHref(role, notificationUrlFromData(data)) : null;
      if (!href) return;

      router.push(href as Href);
      const notificationId = notificationIdFromData(data);
      if (notificationId) void markNotificationRead(notificationId).catch(() => {});
    });

    return () => subscription.remove();
  }, [router, role]);

  return null;
}
