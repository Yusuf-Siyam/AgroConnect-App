import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

export const NOTIFICATION_CHANNEL_ID = 'default';

export type PushTokens = {
  /** Token for the Expo Push Service; requires an EAS project ID. */
  expoPushToken?: string;
  /** Native FCM (Android) or APNs (iOS) token. */
  devicePushToken?: string;
};

/**
 * Displays notifications while the app is in the foreground.
 * Must run before any notification is received; wire this into the root layout
 * when notification UI is introduced in Phase 10.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

function getEasProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

/**
 * Requests notification permission and obtains push tokens.
 * Returns null when permission is denied or push is unavailable on this platform.
 * Remote push needs a development/production build on Android (SDK 53+).
 */
export async function registerForPushNotificationsAsync(): Promise<PushTokens | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: 'AgroConnect',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  const finalStatus =
    existingStatus === 'granted'
      ? existingStatus
      : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== 'granted') {
    return null;
  }

  const tokens: PushTokens = {};
  tokens.devicePushToken = (await Notifications.getDevicePushTokenAsync()).data;

  const projectId = getEasProjectId();
  if (projectId) {
    tokens.expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  }

  return tokens;
}

/** Called when the OS rotates a push token so the backend can update its record. */
export function onPushTokenRotated(listener: (token: string) => void): () => void {
  const subscription = Notifications.addPushTokenListener((token) => listener(token.data));
  return () => subscription.remove();
}
