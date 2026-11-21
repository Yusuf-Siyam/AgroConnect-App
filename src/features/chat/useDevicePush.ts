import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';

import { api, assertApiConfigured } from '@/services/api';
import {
  onPushTokenRotated,
  registerForPushNotificationsAsync,
} from '@/services/notifications';

import { deviceTokenPayload, type PushPlatform } from './notificationRouting';

function currentPlatform(): PushPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

/**
 * Registers the NATIVE FCM/APNs token with the backend and refreshes it when
 * the OS rotates it. Expo Go/web or denied permission simply skip registration;
 * push is always best effort and never blocks authentication or chat.
 */
export function useDevicePushRegistration(uid: string | null, enabled: boolean): void {
  const uploadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !uid || Platform.OS === 'web') return;

    let active = true;
    const platform = currentPlatform();

    const upload = async (token: string | undefined): Promise<void> => {
      const payload = deviceTokenPayload(token, platform);
      if (!payload || !active || uploadedRef.current === payload.token) return;
      assertApiConfigured();
      await api.post('/api/notifications/devices', payload);
      if (active) uploadedRef.current = payload.token;
    };

    void registerForPushNotificationsAsync()
      .then((tokens) => upload(tokens?.devicePushToken))
      .catch(() => {
        // Permission denied or push unavailable: in-app notifications still work.
      });

    const unsubscribe = onPushTokenRotated((token) => {
      void upload(token).catch(() => {
        // Rotation failures are logged by the caller; never break the session.
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, enabled]);
}
