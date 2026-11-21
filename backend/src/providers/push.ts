import { getMessaging } from 'firebase-admin/messaging';

import { getFirebaseAdmin } from '../config/firebase';
import type { PushProvider } from '../types/notification';

/**
 * Production push adapter. Firebase Admin already bundles Cloud Messaging, so
 * no extra SDK or API key is needed on the client. Tests inject a double via
 * `createApp({ pushProvider })`; no real FCM request is made in the test suite.
 */
export function createFcmPushProvider(): PushProvider {
  return {
    async send(_userId, tokens, message) {
      if (tokens.length === 0) return;

      const messaging = getMessaging(getFirebaseAdmin().app);
      await messaging.sendEachForMulticast({
        tokens,
        // Notification text is rendered from type + params only; it never
        // contains chat message content.
        notification: { title: message.title, body: message.body },
        data: message.data,
      });
    },
  };
}
