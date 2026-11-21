import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { Platform } from 'react-native';
import { useEffect } from 'react';

import { markNotificationRead } from '@/features/chat/chatService';
import {
  chatUrlFromData,
  notificationIdFromData,
  type PushData,
} from '@/features/chat/notificationRouting';
import { useDevicePushRegistration } from '@/features/chat/useDevicePush';
import { useAuth } from '@/providers/AuthProvider';
import { configureNotificationHandler } from '@/services/notifications';

// Must be installed before any notification is received.
configureNotificationHandler();

/** Connects native push tokens and notification taps to the authenticated app. */
export function NotificationBridge() {
  const { status, firebaseUser } = useAuth();
  const router = useRouter();
  const authenticated = status === 'authenticated';

  useDevicePushRegistration(authenticated ? (firebaseUser?.uid ?? null) : null, authenticated);

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

    const subscription = Notifications.addNotificationResponseReceivedListener(({ notification }) => {
      const data = notification.request.content.data as PushData;
      const url = chatUrlFromData(data);
      if (!url) return;

      router.push(url as Href);
      const notificationId = notificationIdFromData(data);
      if (notificationId) void markNotificationRead(notificationId).catch(() => {});
    });

    return () => subscription.remove();
  }, [router]);

  return null;
}
